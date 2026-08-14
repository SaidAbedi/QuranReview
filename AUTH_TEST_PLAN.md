# QuranReview Auth Flow - Comprehensive Test Plan

For testing with multiple real users before app store submission.

## Prerequisites

- [ ] Backend running on stable IP (not localhost if testing on physical device)
- [ ] All environment variables configured (Supabase URLs, Quran.Foundation credentials)
- [ ] Email confirmation enabled in Supabase Auth
- [ ] CORS_ORIGINS set to include test device IP
- [ ] Rate limiting configured appropriately for testing

## Test Scenarios

### 1. NEW STUDENT SIGNUP & ONBOARDING

**Test Case 1.1: Successful Signup**
- [ ] Open app → tap "Create Account"
- [ ] Enter: display name, email, password (6+ chars)
- [ ] Tap "Create Account"
- [ ] See: "Check your email" message
- [ ] Check email for confirmation link
- [ ] Click confirmation link (should redirect to app or show success page)
- [ ] Return to app, tap "Sign In"
- [ ] Login with email/password
- [ ] **Expected:** See "Account Pending" screen, not home screen

**Test Case 1.2: Weak Password Validation**
- [ ] Signup with password < 6 characters
- [ ] **Expected:** Error "Password must be at least 6 characters"

**Test Case 1.3: Duplicate Email**
- [ ] Signup with existing email (that already confirmed)
- [ ] **Expected:** Error message from Supabase (e.g., "User already registered")

**Test Case 1.4: Missing Fields**
- [ ] Try to signup with blank display name
- [ ] Try to signup with blank email
- [ ] Try to signup with blank password
- [ ] **Expected:** "Missing fields" error for each

### 2. STUDENT PENDING ASSIGNMENT FLOW

**Test Case 2.1: After Email Confirmation, Before Admin Assignment**
- [ ] Complete signup from Test 1.1
- [ ] Confirm email
- [ ] Login
- [ ] **Expected:** 
  - See "Account Pending" screen
  - Message: "Your account is being set up. An admin will assign you to a teacher shortly."
  - Two buttons: "Refresh Status" and "Sign Out"

**Test Case 2.2: Refresh Status Before Assignment**
- [ ] On pending screen, tap "Refresh Status"
- [ ] **Expected:** Still shows pending screen (no change)

**Test Case 2.3: Admin Assigns Teacher**
- [ ] In separate browser/admin panel:
  - Go to Supabase dashboard → "SQL Editor"
  - Run: `UPDATE student_assignment_requests SET status='assigned', assigned_teacher_id='[TEACHER_UUID]', assigned_at=now() WHERE student_id='[STUDENT_UUID]' AND status='pending_assignment';`
  - Update student profile: `UPDATE user_profiles SET onboarding_status='active' WHERE user_id='[STUDENT_UUID]';`
- [ ] On student's app: tap "Refresh Status"
- [ ] **Expected:** Redirects to home screen /(tabs)

**Test Case 2.4: Notification on Assignment**
- [ ] Before Test 2.3, add device token to student profile
- [ ] After admin assigns teacher
- [ ] **Expected:** Student receives notification (if push enabled)

### 3. PERSISTENT SESSION (NEW)

**Test Case 3.1: Auto-Login After Restart**
- [ ] Login with test@test.com / password123
- [ ] Verify home screen loads
- [ ] Force-close app (completely)
- [ ] Reopen app
- [ ] **Expected:** 
  - No login screen
  - App loads directly to home screen
  - Session restored from secure storage

**Test Case 3.2: Session Persists Across App Backgrounding**
- [ ] Login
- [ ] Tap home button (app goes to background)
- [ ] Wait 30 seconds
- [ ] Tap app icon to return
- [ ] **Expected:** Still logged in, no login screen

**Test Case 3.3: Logout Clears Session**
- [ ] Login
- [ ] Go to Read tab → tap "Sign Out"
- [ ] Confirm logout
- [ ] **Expected:** 
  - Redirects to login screen
  - Close app and reopen
  - Still on login screen (session not restored)

### 4. TOKEN REFRESH & EXPIRY

**Test Case 4.1: Long-Lived Request (Token Doesn't Expire)**
- [ ] Login
- [ ] Open Quran page (loads page content)
- [ ] Leave app running for 2 minutes
- [ ] Tap to interact with page
- [ ] **Expected:** Works without re-login

**Test Case 4.2: Silent Token Refresh (Simulated)**
- [ ] Login
- [ ] In backend logs, observe token expiry time
- [ ] Wait near expiry window (or manually decrease token age in testing)
- [ ] Make an API request
- [ ] **Expected:** Request succeeds (token refreshed silently)

### 5. NEW TEACHER SIGNUP & ROLE ASSIGNMENT

**Test Case 5.1: Teacher Signup (Same as Student)**
- [ ] Create new account with role intended for teacher
- [ ] Confirm email
- [ ] Login
- [ ] **Expected:** See "Account Pending" screen (not teacher home)

**Test Case 5.2: Admin Upgrades to Teacher**
- [ ] In Supabase SQL Editor:
  - `UPDATE users SET role='teacher' WHERE email='teacher@example.com';`
  - `UPDATE user_profiles SET onboarding_status='active' WHERE user_id='[TEACHER_UUID]';`
- [ ] Teacher taps "Refresh Status" or reopens app
- [ ] **Expected:** Redirected to /(teacher)/queue

**Test Case 5.3: Teacher Can Access Teacher UI**
- [ ] As teacher, verify access to:
  - [ ] Queue (list of submissions awaiting review)
  - [ ] Student roster
  - [ ] Review screen for a submission
  - [ ] Notifications tab
- [ ] **Expected:** All screens accessible, no 403 errors

### 6. ROLE-BASED ACCESS CONTROL (RBAC)

**Test Case 6.1: Student Cannot Access Teacher Routes**
- [ ] Login as student
- [ ] Manually navigate to `/(teacher)/queue` via URL/routing
- [ ] **Expected:** Redirected back to /(tabs), cannot access teacher routes

**Test Case 6.2: Teacher Cannot Access Admin Routes**
- [ ] Login as teacher
- [ ] Manually navigate to `/(admin)` via URL
- [ ] **Expected:** Redirected to teacher queue, cannot access admin panel

**Test Case 6.3: Submission Ownership Enforced**
- [ ] Login as Student A
- [ ] Submit a recording
- [ ] Logout
- [ ] Login as Student B
- [ ] Manually try to access Student A's submission via URL
- [ ] **Expected:** 403 Forbidden or redirect (cannot view other student's work)

### 7. ERROR HANDLING

**Test Case 7.1: Invalid Email Format**
- [ ] Signup with "notanemail"
- [ ] **Expected:** Error about invalid email

**Test Case 7.2: Network Error During Signup**
- [ ] Disable network
- [ ] Try to signup
- [ ] **Expected:** Network error message (not a crash)

**Test Case 7.3: Timeout on Auth Verification**
- [ ] Simulate slow backend (add artificial delay)
- [ ] Login
- [ ] **Expected:** Should timeout gracefully after 10 seconds (not hang forever)

**Test Case 7.4: Logout Failure Handling**
- [ ] Login
- [ ] Simulate network disconnect
- [ ] Try to logout
- [ ] **Expected:** Shows error or still clears session locally

### 8. RATE LIMITING & SECURITY

**Test Case 8.1: Rate Limit on Failed Logins**
- [ ] Try to login with wrong password 5 times in quick succession
- [ ] On 6th attempt
- [ ] **Expected:** See "Too many attempts" error (429)
- [ ] Wait 15 minutes (or use test endpoint to reset)
- [ ] **Expected:** Can login again

**Test Case 8.2: CORS Rejection from Invalid Origin**
- [ ] Make a request from a domain not in CORS_ORIGINS
- [ ] **Expected:** Request rejected (CORS error in browser console)

### 9. MULTI-DEVICE TESTING

**Test Case 9.1: Same User on Multiple Devices**
- [ ] Login on Device A
- [ ] Verify home screen
- [ ] Simultaneously login on Device B (same email/password)
- [ ] Verify both devices have active sessions
- [ ] Make a change on Device A (e.g., submit assignment)
- [ ] On Device B, refresh
- [ ] **Expected:** Change visible on Device B (no data inconsistency)

**Test Case 9.2: Logout on One Device Does Not Affect Other**
- [ ] Setup: User logged in on Device A and Device B
- [ ] On Device A: logout
- [ ] **Expected:** Device B still logged in, no forced logout

### 10. EDGE CASES

**Test Case 10.1: Email Confirmation Link Expired**
- [ ] Signup → get confirmation email
- [ ] Wait 24 hours (or simulate by Supabase settings)
- [ ] Click confirmation link
- [ ] **Expected:** Error "Link expired" or similar (graceful)

**Test Case 10.2: User Deleted During Session**
- [ ] Login as Student A
- [ ] In Supabase, delete the user row
- [ ] Try to make an API request
- [ ] **Expected:** 401 Unauthorized (graceful, not a crash)

**Test Case 10.3: App Backgrounded > Token Refresh Window**
- [ ] Login
- [ ] Background app for duration longer than token expiry
- [ ] Return to app
- [ ] Make an action
- [ ] **Expected:** 
  - Auto-refresh uses refresh token
  - If refresh token expired, ask to re-login

## Regression Tests (After Each Fix)

- [ ] Signup still works
- [ ] Login still works
- [ ] Session persistence still works
- [ ] Logout still works
- [ ] Role-based routing still works
- [ ] No new 5xx errors in backend logs

## Test Results Template

```
Test Run Date: ____________________
Tested By: ____________________
Device(s): ____________________

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1.1 | ✓ PASS / ✗ FAIL / ⊘ SKIP | ... |
| 1.2 | ✓ PASS / ✗ FAIL / ⊘ SKIP | ... |
...
```

## Known Limitations (Not Bugs)

- Email confirmation requires real email (no instant in-app confirmation)
- Rate limiting is in-memory (resets on server restart; use Redis for production)
- No "remember this device" option (secure by default, requires login on new device)

## Before Shipping to App Store

- [ ] All test cases pass
- [ ] No console errors or warnings related to auth
- [ ] Backend logs show no auth failures for valid users
- [ ] CORS_ORIGINS configured to production domain only
- [ ] Rate limiting set to production-appropriate thresholds
- [ ] Remove test-users endpoint (`/api/test-users/*`)
- [ ] Review sensitive logging (no PII, no secrets)
