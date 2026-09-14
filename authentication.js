import {
    EmailAuthProvider,
    onAuthStateChanged,
    reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export function createAuthenticationService({
    auth, db, state, getDoc, doc, getStudentByMatrixID,
    getJabatanFromMatrix, normalizeRole, showScreen,
    renderSidebarNavigation, loadPanelContent, signOut
}) {
    function showDashboard() {
        const dashboardRole = state.loginMode === 'staff' ? 'warden' : state.currentRole;
        if (state.loginMode === 'staff') {
            state.currentRole = dashboardRole;
        }
        document.getElementById("sidebarUserName").textContent = state.currentUserData?.nama || auth.currentUser?.email;
        document.getElementById("sidebarUserRole").textContent = dashboardRole.toUpperCase();
        document.getElementById("roleLabel").textContent = dashboardRole.toUpperCase();
        showScreen('dashboardScreen');
        renderSidebarNavigation(dashboardRole, loadPanelContent, () => signOut(auth), () => showScreen('changePasswordScreen'));
        const initialPanel = state.loginMode === 'staff' ? 'dashboard' : state.currentRole === 'pelajar' ? 'rekodSaya' : state.currentRole === 'admin' ? 'adminPanel' : 'dashboard';
        const contentPanel = document.getElementById('contentPanels');
        if (contentPanel) {
            contentPanel.innerHTML = '<div class="card-box"><p>Memuatkan rekod pelajar...</p></div>';
        }
        loadPanelContent(initialPanel).catch(error => {
            console.error(`Panel loading failed for ${initialPanel}:`, error);
            if (contentPanel) {
                contentPanel.innerHTML = `<div class="card-box"><h3>Gagal memuatkan rekod</h3><p>${error?.message || 'Ralat tidak diketahui.'}</p><p>Sila muat semula halaman dan cuba lagi.</p></div>`;
            }
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            showScreen(state.loginMode === 'staff' ? 'staffLoginScreen' : 'loginScreen');
            return;
        }
        if (state.isSigningUp) return;

        const matrix = (user.email || '').split('@')[0].toUpperCase();
        const isStudentIdentity = /^\d{2}[A-Z]{3}/.test(matrix);
        const fallbackRole = state.loginMode === 'staff' || !isStudentIdentity ? 'warden' : 'pelajar';
        try {
            let userDoc = await getDoc(doc(db, "users", user.uid));
            if (!userDoc.exists()) userDoc = await getDoc(doc(db, "users", user.email));
            const studentProfile = await getStudentByMatrixID(matrix);

            if (userDoc.exists()) {
                const userData = userDoc.data();
                state.currentUserData = { ...userData, ...studentProfile, id: studentProfile?.id || userData.id || userDoc.id };
                state.currentUserData.no_matriks = studentProfile?.no_matriks || state.currentUserData.no_matriks || state.currentUserData.id || matrix;
                state.currentUserData.nama = state.currentUserData.name || studentProfile?.nama || state.currentUserData.nama || state.currentUserData.id || matrix;
                state.currentUserData.jabatan = getJabatanFromMatrix(state.currentUserData.no_matriks, studentProfile?.jabatan || state.currentUserData.jabatan || 'N/A');
                const storedRole = normalizeRole(state.currentUserData.role || fallbackRole);
                state.currentRole = state.loginMode === 'staff' && storedRole === 'pelajar' ? 'warden' : storedRole;
            } else {
                state.currentUserData = {
                    ...studentProfile,
                    nama: studentProfile?.nama || matrix,
                    no_matriks: studentProfile?.no_matriks || studentProfile?.id || matrix,
                    role: fallbackRole,
                    jabatan: getJabatanFromMatrix(studentProfile?.no_matriks || studentProfile?.id || matrix, studentProfile?.jabatan || 'N/A'),
                    blok_asrama: 'Blok A', status_amaran: 'Tiada Amaran', markah_disiplin: 100
                };
                state.currentRole = normalizeRole(state.currentUserData.role);
            }
        } catch (error) {
            console.error("Error fetching user profile:", error);
            state.currentRole = fallbackRole;
        }

        const needsStudentPasswordChange = state.currentRole === 'pelajar' && state.currentUserData?.passwordChanged !== true;
        const needsStaffPasswordChange = state.currentRole !== 'pelajar'
            && state.currentUserData?.staffPasswordSetup !== true
            && state.currentUserData?.passwordChanged !== true;
        if (needsStudentPasswordChange || needsStaffPasswordChange) {
            showScreen('changePasswordScreen');
            return;
        }
        showDashboard();
    });

    return { showDashboard };
}

export function setupAuthenticationHandlers(deps) {
    const {
        state, auth, loginForm, usernameInput, passwordInput, loginError, errorText,
        signInWithMatrixOrEmail, staffLoginForm, staffLoginError, staffErrorText,
        signInWithEmailAndPassword, showAuthError, sendPasswordResetEmail,
        resetPasswordForm, resetPasswordIdentityInput, resetPasswordError,
        resetPasswordSuccess, resetPasswordSuccessText, resetPasswordErrorText,
        createStudentPasswordRequest, getStudentByMatrixID, normalizeMatrix,
        signupForm, signupError, signupErrorText, signupMatrixInput,
        signupPasswordInput, signupConfirmPasswordInput, STUDENT_BASE_PASSWORD,
        createStudentAccount, setDoc, doc, saveStudentPassword, signOut,
        changePasswordForm, changePasswordError, changePasswordErrorText,
        currentPasswordInput, newPasswordInput, confirmNewPasswordInput,
        reauthenticateWithCredential, EmailAuthProvider, updatePassword, updateDoc, getDoc, db,
        showDashboard,
        showScreen
    } = deps;

document.querySelectorAll('.password-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
        const input = document.getElementById(toggle.dataset.passwordTarget);
        if (!input) return;
        const isVisible = input.type === 'text';
        input.type = isVisible ? 'password' : 'text';
        toggle.setAttribute('aria-label', isVisible ? 'Tunjukkan kata laluan' : 'Sembunyikan kata laluan');
        toggle.innerHTML = `<i class="fas fa-${isVisible ? 'eye' : 'eye-slash'}"></i>`;
    });
});

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    state.loginMode = 'student';
    const identity = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    try {
        await signInWithMatrixOrEmail(identity, password);
        loginError.classList.remove('show');
    } catch (err) {
        console.error("Login failed:", err);
        errorText.textContent = "Log masuk gagal: Sila semak nombor matriks dan kata laluan.";
        loginError.classList.add('show');
    }
});

staffLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    staffLoginError?.classList.remove('show');
    state.loginMode = 'staff';

    try {
        await signInWithEmailAndPassword(
            auth,
            document.getElementById('staffEmail').value.trim().toLowerCase(),
            document.getElementById('staffPassword').value
        );
    } catch (err) {
        console.error('Staff login failed:', err);
        const message = err?.code === 'auth/user-not-found'
            ? 'Akaun staf tidak dijumpai.'
            : err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
                ? 'Kata laluan staf tidak betul.'
                : err?.code === 'auth/invalid-email'
                    ? 'Format emel staf tidak sah.'
                    : 'Log masuk gagal. Sila semak emel dan kata laluan staf.';
        showAuthError(staffLoginError, staffErrorText, message);
    }
});

resetPasswordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    resetPasswordError?.classList.remove('show');
    resetPasswordSuccess?.classList.remove('show');

    try {
        const matrix = normalizeMatrix(resetPasswordIdentityInput.value);
        const student = await getStudentByMatrixID(matrix);
        if (!student) {
            throw Object.assign(new Error('Pelajar tidak dijumpai.'), { code: 'student/not-found' });
        }

        await createStudentPasswordRequest(matrix);
        resetPasswordSuccessText.textContent = 'Permintaan reset kata laluan telah dihantar kepada warden untuk kelulusan.';
        resetPasswordSuccess?.classList.add('show');
        resetPasswordForm.reset();
    } catch (err) {
        console.error('Password reset request failed:', err);
        const message = err.code === 'student/not-found'
            ? 'No. matriks tidak dijumpai.'
            : 'Reset gagal. Pastikan no. matriks pelajar betul dan cuba lagi.';
        showAuthError(resetPasswordError, resetPasswordErrorText, message);
    }
});

signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupError?.classList.remove('show');
    document.getElementById('signupSuccess')?.classList.remove('show');

    const matrix = normalizeMatrix(signupMatrixInput.value);
    const password = (signupPasswordInput.value || STUDENT_BASE_PASSWORD).trim();
    const confirmPassword = (signupConfirmPasswordInput.value || STUDENT_BASE_PASSWORD).trim();

    if (password !== confirmPassword) {
        showAuthError(signupError, signupErrorText, 'Kata laluan tidak sepadan.');
        return;
    }

    try {
        const student = await getStudentByMatrixID(matrix);
        if (!student) {
            showAuthError(signupError, signupErrorText, 'No. matriks tidak dijumpai dalam pangkalan data pelajar.');
            return;
        }

        if (!password) {
            showAuthError(signupError, signupErrorText, 'Kata laluan pelajar gagal ditentukan.');
            return;
        }

        state.isSigningUp = true;
        const credential = await createStudentAccount(matrix, password);
        await setDoc(doc(db, 'users', credential.user.uid), {
            ...student,
            no_matriks: matrix,
            role: 'pelajar',
            passwordChanged: true
        });
        await saveStudentPassword(matrix, password, true);
        await signOut(auth);
        state.isSigningUp = false;
        signupForm.reset();
        document.getElementById('signupSuccess')?.classList.add('show');
        showScreen('loginScreen');
    } catch (err) {
        state.isSigningUp = false;
        console.error('Sign-up failed:', err);
        const message = err.code === 'auth/email-already-in-use'
            ? 'No. matriks ini sudah mempunyai akaun.'
            : 'Pendaftaran gagal. Sila cuba lagi.';
        showAuthError(signupError, signupErrorText, message);
    }
});

changePasswordForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    changePasswordError?.classList.remove('show');

    const newPassword = newPasswordInput?.value || '';
    const confirmPassword = confirmNewPasswordInput?.value || '';
    const currentPassword = currentPasswordInput?.value || '';
    if (!currentPassword) {
        showAuthError(changePasswordError, changePasswordErrorText, 'Masukkan kata laluan semasa untuk mengesahkan identiti anda.');
        return;
    }
    if (newPassword.length < 6) {
        showAuthError(changePasswordError, changePasswordErrorText, 'Kata laluan mesti mempunyai sekurang-kurangnya 6 aksara.');
        return;
    }
    if (newPassword !== confirmPassword) {
        showAuthError(changePasswordError, changePasswordErrorText, 'Kata laluan tidak sepadan.');
        return;
    }

    try {
        const submitButton = changePasswordForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Menyimpan...';
        }
        const currentUser = auth.currentUser;
        if (!currentUser?.email) throw new Error('Akaun pengguna tidak dijumpai.');
        const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
        await reauthenticateWithCredential(currentUser, credential);
        await updatePassword(currentUser, newPassword);
        const passwordUpdate = { passwordChanged: true };
        if (state.currentRole !== 'pelajar') passwordUpdate.staffPasswordSetup = true;

        let userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (!userDoc.exists() && auth.currentUser?.email) {
            userDoc = await getDoc(doc(db, 'users', auth.currentUser.email));
        }
        if (userDoc.exists()) {
            await setDoc(userDoc.ref, passwordUpdate, { merge: true });
        } else {
            await setDoc(doc(db, 'users', auth.currentUser.uid), {
                email: auth.currentUser?.email || '',
                role: state.currentRole,
                ...passwordUpdate
            }, { merge: true });
        }

        if (state.currentRole === 'pelajar') {
            await saveStudentPassword(state.currentUserData?.no_matriks || auth.currentUser?.email, newPassword, true);
        }
        state.currentUserData = state.currentUserData || {};
        state.currentUserData.passwordChanged = true;
        if (state.currentRole !== 'pelajar') state.currentUserData.staffPasswordSetup = true;
        changePasswordForm.reset();
        showDashboard();
    } catch (err) {
        const submitButton = changePasswordForm.querySelector('button[type="submit"]');
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = '<i class="fas fa-save"></i> Simpan Kata Laluan';
        }
        console.error('Password update failed:', err);
        if (err?.code === 'auth/requires-recent-login') {
            showAuthError(changePasswordError, changePasswordErrorText, 'Sesi log masuk telah tamat. Sila log masuk semula sebelum menukar kata laluan.');
            await signOut(auth);
            return;
        }

        const message = err?.code === 'permission-denied'
            ? 'Akses pangkalan data ditolak. Sila pastikan dokumen pengguna mempunyai kebenaran kemas kini.'
            : err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
                ? 'Kata laluan semasa tidak betul.'
            : err?.code === 'auth/weak-password'
                ? 'Kata laluan mesti mempunyai sekurang-kurangnya 6 aksara.'
                : `Kata laluan gagal dikemas kini${err?.code ? ` (${err.code})` : ''}. Sila cuba lagi.`;
        showAuthError(changePasswordError, changePasswordErrorText, message);
    }
});
}
