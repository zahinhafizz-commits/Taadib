# Taadib

## Password reset function

Warden approval of a student password reset is handled by a Firebase callable function. Deploy it to the configured Firebase project with the Firebase CLI after signing in:

```sh
firebase deploy --only functions --project system-fyp
```

Cloud Functions deployment requires the project to use the Blaze billing plan. The function only allows authenticated users whose `users/{uid}` document has a warden, chief warden, or admin role to approve a request.

## Firestore rules

Deploy Firestore rules after changing `firestore.rules` so authenticated users can access their own profile and update password metadata. Staff can sign in without first changing their password; students still need to change their initial password.

```sh
firebase deploy --only firestore:rules --project system-fyp
```

The app saves the setup flag before changing the Auth password so a Firestore permission error cannot leave the password updated without the flag.