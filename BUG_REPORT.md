# 🐛 Comprehensive Bug Report - iofus Codebase

## Summary
This report documents 9 confirmed bugs and architectural issues found in the iofus codebase during adversarial testing. Three are CRITICAL, two are MAJOR, and four are MINOR/DESIGN issues.

---

## 🔴 CRITICAL BUGS

### 1. **Proximity Graph Returns Duplicate Handles in Wander Batch**
- **File**: `app/src/lib/proximityGraph.ts` (lines 127-139)
- **Severity**: CRITICAL - Data Integrity Issue
- **Issue**: When a user has proximity edges to multiple people, and an early proximity contact has no published page, the `getWanderBatch` function can return duplicate handles in the same batch.
  - The bug is in how `selectedUserIds` is calculated: `proximityIds.slice(0, rows.length)`
  - This slices by position, not by actual content
  - If proximity user #1 is undiscoverable, it's not included in `rows`, but `selectedUserIds` still includes them positionally
  - The random query then fails to exclude the actually-selected user #2, resulting in duplicates
- **Impact**: Users see the same person twice in Wander recommendations
- **Fix**: Build `selectedUserIds` from `idToHandle.keys()` to match actual results, not positions
- **Regression Test**: Test that when first proximity neighbor is undiscoverable, second neighbor isn't duplicated

---

### 2. **AmbientStatusDisplay Polling Continues After Component Unmount**
- **File**: `app/src/components/AmbientStatusDisplay.tsx` (lines 18-45)
- **Severity**: CRITICAL - Memory Leak & State Update Warning
- **Issue**: The polling effect for status updates doesn't cancel the in-flight fetch when component unmounts
  - When `pageOwnerId` changes or component unmounts, the effect cleans up the timeout
  - But the pending `fetch()` request continues in the background
  - When the fetch completes, it tries to call `setStatus()`, `setBackoff()` on unmounted component
  - This causes: (a) memory leak, (b) React warning "Can't perform state update on unmounted component", (c) wasted bandwidth
- **Impact**: Console warnings, memory leaks, unnecessary network requests after navigation
- **Fix**: Use AbortController to cancel fetch, check `!cancelled` before setState calls, call `controller.abort()` in cleanup
- **Example Fix**:
  ```typescript
  const controller = new AbortController();
  let cancelled = false;
  
  fetch(url, { signal: controller.signal })
    .then(r => {
      if (cancelled) return null;  // Guard all state updates
      setStatus(data);
    });
  
  return () => {
    cancelled = true;
    controller.abort();
    clearTimeout(timeoutId);
  };
  ```

---

### 3. **Ring Edge Provenance Not Tracked - Shared Ring Bug**
- **File**: `app/src/lib/proximityGraph.ts` & `app/src/lib/webRings.ts`
- **Severity**: CRITICAL - Graph Inconsistency
- **Issue**: When two users are in multiple web rings together, the graph edge between them is tracked with `edgeType: "ring"` only. No tracking of which rings contribute to this edge.
  - User A and B are in Ring 1 (edge created)
  - User A and B are in Ring 2 (edge weight incremented, same edge row)
  - User A leaves Ring 1 → `leaveWebRing` calls `removeEdge(A, B, "ring")`
  - This DELETES the entire edge, even though A and B are still connected via Ring 2!
- **Impact**: Loss of valid proximity relationships when leaving one of multiple shared rings
- **Fix**: Either:
  1. Store per-ring contributions in a `ring_id` column with reference counting, OR
  2. Use a separate edge row per ring, OR
  3. Track a count of how many rings support each edge and only delete when count reaches 0
- **Regression Test**: Two users in two rings, leave one ring, verify edge still exists

---

## 🟠 MAJOR BUGS

### 4. **Test Assertions Too Weak in proximityGraph.test.ts**
- **File**: `app/src/lib/proximityGraph.test.ts` (lines 98-111)
- **Severity**: MAJOR - Tests Don't Validate Behavior
- **Issue**: The `getWanderBatch` tests have assertions that pass even when the function returns empty arrays:
  - Line 102: `expect(result.length).toBeGreaterThanOrEqual(0)` — always true, even for `[]`
  - Line 110: Loop `for (const h of result)` never executes if result is empty, so type assertion never runs
- **Impact**: Bugs in `getWanderBatch` logic aren't caught by tests. A function could always return `[]` and tests would pass.
- **Fix**: 
  1. Require created page to be in result before checking types
  2. Assert `result.length > 0` before running type checks
- **Example**:
  ```typescript
  // Before (bad):
  expect(result.length).toBeGreaterThanOrEqual(0);
  for (const h of result) expect(typeof h).toBe("string");
  
  // After (good):
  expect(result.length).toBeGreaterThan(0);
  expect(result).toContain("wanderer");
  for (const h of result) expect(typeof h).toBe("string");
  ```

---

### 5. **Missing Error Handling in signGuestbook/recordEdge**
- **File**: `app/src/lib/guestbook.ts` (lines 86-100)
- **Severity**: MAJOR - Partial Failure = Inconsistency
- **Issue**: The `signGuestbook` function inserts the guestbook entry, then calls `recordEdge()`. If `recordEdge()` throws, the entry is already committed.
  - Guestbook entry exists in database
  - But the proximity graph edge was never created
  - Database is now inconsistent
- **Impact**: Guestbook entries exist without corresponding graph edges, breaking proximity discovery assumptions
- **Fix**: Either:
  1. Wrap both operations in a transaction
  2. Validate/preflight `recordEdge` before inserting entry
  3. Catch recordEdge errors and log/alert without crashing
  ```typescript
  try {
    recordEdge(authorId, pageOwnerId, "guestbook");
  } catch (e) {
    console.error("Failed to record graph edge:", e);
    // Entry already inserted but edge failed - log for monitoring
  }
  ```

---

## 🟡 MINOR / DESIGN ISSUES

### 6. **blockCheckId Parameter Confusion in signGuestbook**
- **File**: `app/src/lib/guestbook.ts` (line 75)
- **Severity**: MINOR - Confusing API
- **Issue**: Parameter has confusing default: `blockCheckId: string | null = authorId`
  - Callers might forget to pass `blockCheckId` explicitly when `authorId` is null
  - The block check then defaults to checking null, which passes the block check
  - This is technically safe (block check is expensive to bypass), but the pattern is confusing
- **Impact**: Potential for accidental security bypasses if code changes
- **Fix**: Make parameter required, not defaulted
  ```typescript
  // Instead of:
  signGuestbook(..., blockCheckId: string | null = authorId)
  
  // Use:
  signGuestbook(..., blockCheckId: string | null)
  // And always pass it explicitly at callsites
  ```

---

### 7. **Ambient Status Uses ISO String Comparison Instead of Timestamps**
- **File**: `app/src/lib/ambientStatus.ts` (lines 36-38, 55)
- **Severity**: MINOR - Timing Edge Case
- **Issue**: The code compares ISO timestamp strings lexicographically: `expires_at >= ?` where `?` is an ISO string like `"2026-08-22T03:20:00.000Z"`
  - ISO strings do sort chronologically, so this works, BUT:
  - Millisecond-level precision can cause off-by-one edge cases
  - If expiration happens exactly at the current millisecond, behavior depends on parsing order
  - Uses string operations instead of numeric timestamp comparison
- **Impact**: Rare off-by-one edge cases where status appears expired when it shouldn't (or vice versa)
- **Fix**: Use Unix milliseconds for all timestamp operations
  ```typescript
  const expiresAt = Date.now() + TTL_MS;  // Unix ms
  const now = Date.now();
  // Then: WHERE expires_at >= ?  (numeric comparison)
  ```

---

### 8. **Ambiguous Fallback in JSON.parse Catches**
- **File**: `app/src/app/[handle]/page.tsx` (lines 71-75), and other locations
- **Severity**: MINOR - Silent Data Loss
- **Issue**: Multiple places catch JSON.parse errors and silently fall back without logging
  - If `document_json` is corrupted, the issue goes unnoticed
  - Could indicate database corruption or invalid data pipeline
  - No monitoring/alerts
- **Impact**: Silent data loss, makes debugging harder
- **Fix**: Log warnings when fallbacks happen
  ```typescript
  try {
    const doc = JSON.parse(r.document_json);
  } catch (e) {
    console.warn(`Failed to parse document for user ${userId}:`, e);
    displayName = raw;
  }
  ```

---

### 9. **Timestamp Created But Never Read in Guestbook Moderation**
- **File**: `app/src/lib/guestbook.ts` (line 111)
- **Severity**: MINOR - Dead Code
- **Issue**: The `reviewed_at` timestamp is created every time an entry is moderated, but it's never read or used anywhere
  - There's no query that orders by review time
  - No UI that shows when entries were reviewed
  - Just database bloat
- **Impact**: Wasted storage space
- **Fix**: Either use it (e.g., show review order in moderation UI) or remove the column

---

## 📊 Summary Table

| Bug | Severity | Type | File | Impact |
|-----|----------|------|------|--------|
| Duplicate handles in Wander | 🔴 CRITICAL | Logic | proximityGraph.ts | Bad UX, confusing discovery |
| Polling after unmount | 🔴 CRITICAL | Memory Leak | AmbientStatusDisplay.tsx | Console warnings, memory leak |
| Ring edge provenance | 🔴 CRITICAL | Data Loss | proximityGraph.ts, webRings.ts | Lost relationships |
| Weak test assertions | 🟠 MAJOR | Testing | proximityGraph.test.ts | Undetected bugs |
| Missing error handling | 🟠 MAJOR | Consistency | guestbook.ts | DB inconsistency |
| blockCheckId confusion | 🟡 MINOR | API Design | guestbook.ts | Future maintenance risk |
| ISO string comparison | 🟡 MINOR | Timing | ambientStatus.ts | Edge cases |
| Silent JSON failures | 🟡 MINOR | Monitoring | Multiple | Silent data loss |
| Dead review timestamp | 🟡 MINOR | Dead Code | guestbook.ts | Wasted storage |

---

## 🔧 Recommended Priority

1. **Fix immediately** (CRITICAL):
   - Proximity graph duplicate handles
   - AmbientStatusDisplay polling leak
   - Ring edge provenance

2. **Fix soon** (MAJOR):
   - Test assertions
   - Error handling in guestbook

3. **Fix when refactoring** (MINOR):
   - Other design issues

---

## 🧪 Test Coverage
All bugs have been documented in: `app/src/lib/bugs.test.ts`

Run with: `npm test -- src/lib/bugs.test.ts`
