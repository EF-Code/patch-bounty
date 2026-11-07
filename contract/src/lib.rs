use near_sdk::collections::{LookupMap, LookupSet};
use near_sdk::json_types::{U128, U64};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, Promise, PromiseResult,
};

const STORAGE_ALLOWANCE: u128 = 20_000_000_000_000_000_000_000;
const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status {
    Open,
    Claimed,
    Paying,
    Approved,
    Paid,
    Refunding,
    Refunded,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Claim {
    pub id: U64,
    pub claimant: AccountId,
    pub candidate_sha256: String,
    pub evidence_sha256: Option<String>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Challenge {
    pub creator: AccountId,
    pub verifier: AccountId,
    pub specification_sha256: String,
    pub deadline_ns: U64,
    pub reward: U128,
    pub status: Status,
    pub next_claim_id: U64,
    pub claim: Option<Claim>,
}

#[ext_contract(ext_self)]
trait Callbacks {
    fn on_payout(&mut self, challenge_id: U64, claim_id: U64) -> bool;
    fn on_refund(&mut self, challenge_id: U64) -> bool;
}

#[near(contract_state)]
pub struct Escrow {
    next_challenge_id: u64,
    challenges: LookupMap<u64, Challenge>,
    used_evidence: LookupSet<String>,
}

impl Default for Escrow {
    fn default() -> Self {
        Self {
            next_challenge_id: 0,
            challenges: LookupMap::new(b"c"),
            used_evidence: LookupSet::new(b"e"),
        }
    }
}

fn valid_digest(digest: &str) -> bool {
    digest.len() == 64
        && digest
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

#[near]
impl Escrow {
    #[payable]
    pub fn create_challenge(
        &mut self,
        verifier: AccountId,
        specification_sha256: String,
        deadline_ns: U64,
    ) -> U64 {
        require!(
            valid_digest(&specification_sha256),
            "invalid specification digest"
        );
        require!(
            deadline_ns.0 > env::block_timestamp(),
            "deadline must be in the future"
        );
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit > STORAGE_ALLOWANCE,
            "deposit must exceed storage allowance"
        );
        let id = self.next_challenge_id;
        self.next_challenge_id = id.checked_add(1).expect("challenge ID overflow");
        self.challenges.insert(
            &id,
            &Challenge {
                creator: env::predecessor_account_id(),
                verifier,
                specification_sha256,
                deadline_ns,
                reward: U128(deposit - STORAGE_ALLOWANCE),
                status: Status::Open,
                next_claim_id: U64(0),
                claim: None,
            },
        );
        U64(id)
    }

    pub fn get_challenge(&self, challenge_id: U64) -> Option<Challenge> {
        self.challenges.get(&challenge_id.0)
    }

    pub fn submit_claim(&mut self, challenge_id: U64, candidate_sha256: String) -> U64 {
        require!(valid_digest(&candidate_sha256), "invalid candidate digest");
        let mut challenge = self.load(challenge_id);
        require!(
            env::block_timestamp() < challenge.deadline_ns.0,
            "challenge expired"
        );
        require!(challenge.status == Status::Open, "challenge is not open");
        let claim_id = challenge.next_claim_id.0;
        challenge.next_claim_id = U64(claim_id.checked_add(1).expect("claim ID overflow"));
        challenge.claim = Some(Claim {
            id: U64(claim_id),
            claimant: env::predecessor_account_id(),
            candidate_sha256,
            evidence_sha256: None,
        });
        challenge.status = Status::Claimed;
        self.challenges.insert(&challenge_id.0, &challenge);
        U64(claim_id)
    }

    pub fn reject_claim(&mut self, challenge_id: U64, claim_id: U64) {
        let mut challenge = self.load(challenge_id);
        Self::check_claim(&challenge, claim_id);
        challenge.claim = None;
        challenge.status = Status::Open;
        self.challenges.insert(&challenge_id.0, &challenge);
    }

    pub fn approve_claim(
        &mut self,
        challenge_id: U64,
        claim_id: U64,
        candidate_sha256: String,
        evidence_sha256: String,
    ) -> Promise {
        require!(valid_digest(&evidence_sha256), "invalid evidence digest");
        let mut challenge = self.load(challenge_id);
        Self::check_claim(&challenge, claim_id);
        require!(
            !self.used_evidence.contains(&evidence_sha256),
            "evidence already used"
        );
        let claim = challenge.claim.as_mut().expect("missing claim");
        require!(
            claim.candidate_sha256 == candidate_sha256,
            "candidate digest mismatch"
        );
        claim.evidence_sha256 = Some(evidence_sha256.clone());
        self.used_evidence.insert(&evidence_sha256);
        challenge.status = Status::Paying;
        self.challenges.insert(&challenge_id.0, &challenge);
        Self::payout(challenge_id, &challenge)
    }

    pub fn retry_payout(&mut self, challenge_id: U64) -> Promise {
        let mut challenge = self.load(challenge_id);
        require!(
            challenge.status == Status::Approved,
            "no failed payout to retry"
        );
        challenge.status = Status::Paying;
        self.challenges.insert(&challenge_id.0, &challenge);
        Self::payout(challenge_id, &challenge)
    }

    pub fn refund(&mut self, challenge_id: U64) -> Promise {
        let mut challenge = self.load(challenge_id);
        require!(
            env::predecessor_account_id() == challenge.creator,
            "only creator may refund"
        );
        require!(
            env::block_timestamp() >= challenge.deadline_ns.0,
            "challenge has not expired"
        );
        require!(
            challenge.status == Status::Open || challenge.status == Status::Claimed,
            "challenge cannot be refunded"
        );
        challenge.claim = None;
        challenge.status = Status::Refunding;
        self.challenges.insert(&challenge_id.0, &challenge);
        Promise::new(challenge.creator)
            .transfer(NearToken::from_yoctonear(challenge.reward.0))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_refund(challenge_id),
            )
    }

    #[private]
    pub fn on_payout(&mut self, challenge_id: U64, claim_id: U64) -> bool {
        let mut challenge = self.load(challenge_id);
        require!(challenge.status == Status::Paying, "payout is not pending");
        require!(
            challenge.claim.as_ref().map(|c| c.id.0) == Some(claim_id.0),
            "claim mismatch"
        );
        let success = matches!(env::promise_result(0), PromiseResult::Successful(_));
        challenge.status = if success {
            Status::Paid
        } else {
            Status::Approved
        };
        self.challenges.insert(&challenge_id.0, &challenge);
        success
    }

    #[private]
    pub fn on_refund(&mut self, challenge_id: U64) -> bool {
        let mut challenge = self.load(challenge_id);
        require!(
            challenge.status == Status::Refunding,
            "refund is not pending"
        );
        let success = matches!(env::promise_result(0), PromiseResult::Successful(_));
        challenge.status = if success {
            Status::Refunded
        } else {
            Status::Open
        };
        self.challenges.insert(&challenge_id.0, &challenge);
        success
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{
        get_created_receipts, testing_env_with_promise_results, VMContextBuilder,
    };
    use near_sdk::testing_env;

    fn account(name: &str) -> AccountId {
        format!("{name}.testnet").parse().unwrap()
    }
    fn context(who: &str, time: u64, deposit: u128) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("escrow"))
            .signer_account_id(account(who))
            .predecessor_account_id(account(who))
            .block_timestamp(time)
            .attached_deposit(NearToken::from_yoctonear(deposit));
        builder
    }
    fn set(who: &str, time: u64, deposit: u128) {
        testing_env!(context(who, time, deposit).build());
    }
    fn digest(char: char) -> String {
        char.to_string().repeat(64)
    }
    fn setup() -> Escrow {
        set("creator", 1, STORAGE_ALLOWANCE + 1_000);
        let mut contract = Escrow::default();
        assert_eq!(
            contract
                .create_challenge(account("verifier"), digest('a'), U64(100))
                .0,
            0
        );
        contract
    }
    fn claim(contract: &mut Escrow) {
        set("alice", 2, 0);
        assert_eq!(contract.submit_claim(U64(0), digest('b')).0, 0);
    }
    fn approve(contract: &mut Escrow) {
        set("verifier", 3, 0);
        drop(contract.approve_claim(U64(0), U64(0), digest('b'), digest('c')));
    }
    #[allow(deprecated)]
    fn callback(success: bool) {
        let result = if success {
            PromiseResult::Successful(vec![])
        } else {
            PromiseResult::Failed
        };
        testing_env_with_promise_results(context("escrow", 4, 0).build(), result);
    }

    #[test]
    fn payout_only_to_claimant_and_successful_callback() {
        let mut contract = setup();
        claim(&mut contract);
        approve(&mut contract);
        assert_eq!(contract.load(U64(0)).status, Status::Paying);
        assert!(get_created_receipts()
            .iter()
            .any(|receipt| receipt.receiver_id == account("alice")));
        callback(true);
        assert!(contract.on_payout(U64(0), U64(0)));
        assert_eq!(contract.load(U64(0)).status, Status::Paid);
    }

    #[test]
    fn failed_payout_can_only_retry_same_recipient() {
        let mut contract = setup();
        claim(&mut contract);
        approve(&mut contract);
        callback(false);
        assert!(!contract.on_payout(U64(0), U64(0)));
        assert_eq!(contract.load(U64(0)).status, Status::Approved);
        set("bob", 101, 0);
        drop(contract.retry_payout(U64(0)));
        assert!(get_created_receipts()
            .iter()
            .any(|receipt| receipt.receiver_id == account("alice")));
        callback(true);
        assert!(contract.on_payout(U64(0), U64(0)));
    }

    #[test]
    fn refund_at_deadline_and_retry_after_failure() {
        let mut contract = setup();
        claim(&mut contract);
        set("creator", 100, 0);
        drop(contract.refund(U64(0)));
        assert_eq!(contract.load(U64(0)).status, Status::Refunding);
        callback(false);
        assert!(!contract.on_refund(U64(0)));
        set("creator", 101, 0);
        drop(contract.refund(U64(0)));
        assert!(get_created_receipts()
            .iter()
            .any(|receipt| receipt.receiver_id == account("creator")));
        callback(true);
        assert!(contract.on_refund(U64(0)));
        assert_eq!(contract.load(U64(0)).status, Status::Refunded);
    }

    #[test]
    fn rejected_claim_id_cannot_be_reused() {
        let mut contract = setup();
        claim(&mut contract);
        set("verifier", 3, 0);
        contract.reject_claim(U64(0), U64(0));
        set("bob", 4, 0);
        assert_eq!(contract.submit_claim(U64(0), digest('d')).0, 1);
    }

    #[test]
    #[should_panic(expected = "only verifier may decide")]
    fn wrong_verifier_rejected() {
        let mut contract = setup();
        claim(&mut contract);
        set("bob", 3, 0);
        drop(contract.approve_claim(U64(0), U64(0), digest('b'), digest('c')));
    }

    #[test]
    #[should_panic(expected = "candidate digest mismatch")]
    fn wrong_candidate_rejected() {
        let mut contract = setup();
        claim(&mut contract);
        set("verifier", 3, 0);
        drop(contract.approve_claim(U64(0), U64(0), digest('d'), digest('c')));
    }

    #[test]
    #[should_panic(expected = "no claim awaiting decision")]
    fn duplicate_approval_rejected() {
        let mut contract = setup();
        claim(&mut contract);
        approve(&mut contract);
        drop(contract.approve_claim(U64(0), U64(0), digest('b'), digest('c')));
    }

    #[test]
    #[should_panic(expected = "evidence already used")]
    fn cross_challenge_evidence_replay_rejected() {
        let mut contract = setup();
        claim(&mut contract);
        approve(&mut contract);
        set("creator", 4, STORAGE_ALLOWANCE + 1_000);
        contract.create_challenge(account("verifier"), digest('a'), U64(100));
        set("alice", 5, 0);
        contract.submit_claim(U64(1), digest('b'));
        set("verifier", 6, 0);
        drop(contract.approve_claim(U64(1), U64(0), digest('b'), digest('c')));
    }

    #[test]
    #[should_panic(expected = "challenge expired")]
    fn approval_at_deadline_rejected() {
        let mut contract = setup();
        claim(&mut contract);
        set("verifier", 100, 0);
        drop(contract.approve_claim(U64(0), U64(0), digest('b'), digest('c')));
    }

    #[test]
    #[should_panic(expected = "only creator may refund")]
    fn wrong_refund_recipient_rejected() {
        let mut contract = setup();
        set("bob", 100, 0);
        drop(contract.refund(U64(0)));
    }
}

impl Escrow {
    fn load(&self, challenge_id: U64) -> Challenge {
        self.challenges
            .get(&challenge_id.0)
            .expect("unknown challenge")
    }

    fn check_claim(challenge: &Challenge, claim_id: U64) {
        require!(
            env::predecessor_account_id() == challenge.verifier,
            "only verifier may decide"
        );
        require!(
            env::block_timestamp() < challenge.deadline_ns.0,
            "challenge expired"
        );
        require!(
            challenge.status == Status::Claimed,
            "no claim awaiting decision"
        );
        require!(
            challenge.claim.as_ref().map(|c| c.id.0) == Some(claim_id.0),
            "claim mismatch"
        );
    }

    fn payout(challenge_id: U64, challenge: &Challenge) -> Promise {
        let claim = challenge.claim.as_ref().expect("missing claim");
        Promise::new(claim.claimant.clone())
            .transfer(NearToken::from_yoctonear(challenge.reward.0))
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_payout(challenge_id, claim.id),
            )
    }
}
