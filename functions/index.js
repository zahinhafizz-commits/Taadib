const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();

const db = getFirestore();
const BASE_PASSWORD = '123456';

function normalizeRole(role) {
    const value = (role || '').toString().trim().toLowerCase();
    if (['admin', 'administrator'].includes(value)) return 'admin';
    if (['ketua warden', 'ketua_warden', 'ketua-warden', 'chief warden', 'chief_warden'].includes(value)) return 'ketua_warden';
    if (['warden', 'warden_tadib', 'penjaga', 'supervisor', 'hep', 'hep_tadib', 'office'].includes(value)) return 'warden';
    return 'pelajar';
}

exports.approveStudentPasswordReset = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Log masuk diperlukan.');
    }

    const wardenSnapshot = await db.collection('users').doc(request.auth.uid).get();
    const role = normalizeRole(wardenSnapshot.data()?.role);
    if (!wardenSnapshot.exists || !['warden', 'ketua_warden', 'admin'].includes(role)) {
        throw new HttpsError('permission-denied', 'Hanya warden boleh meluluskan permintaan.');
    }

    const requestId = request.data?.requestId;
    if (typeof requestId !== 'string' || !requestId.trim()) {
        throw new HttpsError('invalid-argument', 'ID permintaan tidak sah.');
    }

    const requestRef = db.collection('password_reset_requests').doc(requestId);
    const requestSnapshot = await requestRef.get();
    if (!requestSnapshot.exists) {
        throw new HttpsError('not-found', 'Permintaan reset tidak dijumpai.');
    }

    const resetRequest = requestSnapshot.data();
    if (resetRequest.status !== 'pending') {
        throw new HttpsError('failed-precondition', 'Permintaan ini telah diproses.');
    }

    const matrix = (resetRequest.no_matriks || '').toString().trim().replace(/\s+/g, '').toUpperCase();
    if (!matrix) {
        throw new HttpsError('failed-precondition', 'No. matriks dalam permintaan tidak sah.');
    }

    let studentAccount;
    try {
        studentAccount = await getAuth().getUserByEmail(`${matrix.toLowerCase()}@tadib.com`);
    } catch (error) {
        if (error.code === 'auth/user-not-found') {
            throw new HttpsError('not-found', 'Akaun pelajar tidak dijumpai.');
        }
        throw error;
    }

    await getAuth().updateUser(studentAccount.uid, { password: BASE_PASSWORD });
    await db.collection('users').doc(studentAccount.uid).set({
        password: FieldValue.delete(),
        passwordChanged: false,
        updatedAt: new Date().toISOString()
    }, { merge: true });

    await requestRef.update({
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: wardenSnapshot.data().nama || wardenSnapshot.data().name || request.auth.token.email || 'Warden'
    });

    return { success: true };
});