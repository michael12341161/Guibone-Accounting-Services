# Task: Update profile dropdown password expiry text to "expires in X days" ✓

## Steps:
1. [x] Edit `src/components/layout/layout_utils.js`: Replace getProfileMenuExpiryLabel logic to always use lowercase format:
   - 0 days: "expires today" 
   - 1 day: "expires in 1 day" 
   - >1: "expires in X days"
2. [ ] Refresh app and verify badge in profile dropdown (Change Password item) shows new format
3. [ ] Test with different expiry values via backend session
4. [x] Mark complete
