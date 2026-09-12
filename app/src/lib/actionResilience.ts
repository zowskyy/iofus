import { unstable_rethrow } from "next/navigation";

/**
 * Wraps a `useActionState` action so a genuine network failure (dropped
 * connection, aborted request) becomes a normal `{ error }` state update
 * instead of an uncaught rejection.
 *
 * Without this, every `useActionState`-driven form in the app propagated a
 * network failure straight to the nearest error boundary (src/app/error.tsx)
 * — reproduced directly for signup via Playwright request interception
 * (tests/e2e/network-resilience.spec.ts). The boundary is a real safety net
 * (it used to be nothing at all — Next.js's generic crash screen), but it
 * still unmounts the form, losing whatever the user had typed. Wrapping the
 * action itself keeps the user on the same form with their input intact and
 * a normal inline error banner, matching how StampsModule and
 * AmbientStatusEditor already handle their own fetch() calls.
 *
 * Every action's state shape in this codebase already carries `error?:
 * string` (13 forms, checked directly against every actions.ts file), so
 * one generic wrapper covers all of them without per-form duplication.
 *
 * `redirect()` (used by loginAction, signupAction, makeFlowAction) works by
 * throwing a special NEXT_REDIRECT control-flow error that Next.js's
 * framework catches to perform the navigation — a plain `catch {}` here
 * would intercept it first and turn a successful redirect into a false
 * "Network error" state. `unstable_rethrow` re-throws that (and notFound's)
 * control-flow error unchanged; only genuine exceptions reach the fallback.
 *
 * States that carry a `success` message (ManageRingControls, GuestbookSignForm)
 * render success and error independently, so a handled failure that only sets
 * `error` would leave a stale success message from a prior submission showing
 * alongside it. Clearing `success` here (a no-op cast for states that never
 * had the field) keeps a failure state unambiguous.
 */
export function withNetworkErrorHandling<State extends { error?: string }>(
  action: (prevState: State, formData: FormData) => Promise<State>,
  message = "Network error — please try again.",
): (prevState: State, formData: FormData) => Promise<State> {
  return async (prevState, formData) => {
    try {
      return await action(prevState, formData);
    } catch (error) {
      unstable_rethrow(error);
      return { ...prevState, error: message, success: undefined } as State;
    }
  };
}
