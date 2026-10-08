# Taadib

## Password reset function

Warden approval of a student password reset is handled by a Firebase callable function. Deploy it to the configured Firebase project with the Firebase CLI after signing in:

```sh
firebase deploy --only functions --project system-fyp
```

Cloud Functions deployment requires the project to use the Blaze billing plan. The function only allows authenticated users whose `users/{uid}` document has a warden, chief warden, or admin role to approve a request.

## Firestore rules

Deploy Firestore rules after changing `firestore.rules` so authenticated users can access their own profile and update password metadata. A password change must save its setup flag to the user's profile; without the deployed rules, staff can be sent back to the password-change screen on every login.

```sh
firebase deploy --only firestore:rules --project system-fyp
```

If a user's password was already changed but the setup flag was not saved, deploy the rules, sign in using the current password, and change it once more. The app saves the setup flag before changing the Auth password so a Firestore permission error cannot leave the password updated without the flag.