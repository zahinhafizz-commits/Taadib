# Taadib

## Password reset function

Warden approval of a student password reset is handled by a Firebase callable function. Deploy it to the configured Firebase project with the Firebase CLI after signing in:

```sh
firebase deploy --only functions --project system-fyp
```

Cloud Functions deployment requires the project to use the Blaze billing plan. The function only allows authenticated users whose `users/{uid}` document has a warden, chief warden, or admin role to approve a request.

## Firestore rules

Deploy Firestore rules after changing `firestore.rules` so authenticated users can access their own profile and update password metadata:

```sh
firebase deploy --only firestore:rules --project system-fyp
```