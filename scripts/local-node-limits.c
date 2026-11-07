/* Optional compatibility shim for the trusted local NEAR node only.
 * Keep the host's real hard descriptor ceiling; change no other resources.
 * Never preload this into the verifier or submitted code.
 */
#define _GNU_SOURCE
#include <sys/resource.h>
#include <dlfcn.h>
int setrlimit(__rlimit_resource_t resource, const struct rlimit *requested) {
    int (*real)(__rlimit_resource_t, const struct rlimit *) = dlsym(RTLD_NEXT, "setrlimit");
    struct rlimit current, adjusted = *requested;
    if (resource == RLIMIT_NOFILE && getrlimit(resource, &current) == 0 && current.rlim_max != RLIM_INFINITY && adjusted.rlim_max > current.rlim_max) {
        adjusted.rlim_max = current.rlim_max;
        if (adjusted.rlim_cur > adjusted.rlim_max) adjusted.rlim_cur = adjusted.rlim_max;
    }
    return real(resource, &adjusted);
}
int setrlimit64(__rlimit_resource_t resource, const struct rlimit64 *requested) {
    int (*real)(__rlimit_resource_t, const struct rlimit64 *) = dlsym(RTLD_NEXT, "setrlimit64");
    struct rlimit64 current, adjusted = *requested;
    if (resource == RLIMIT_NOFILE && getrlimit64(resource, &current) == 0 && current.rlim_max != RLIM64_INFINITY && adjusted.rlim_max > current.rlim_max) {
        adjusted.rlim_max = current.rlim_max;
        if (adjusted.rlim_cur > adjusted.rlim_max) adjusted.rlim_cur = adjusted.rlim_max;
    }
    return real(resource, &adjusted);
}
