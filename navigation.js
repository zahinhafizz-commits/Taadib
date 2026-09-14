function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
}

function setLoginMode(mode) {
    sessionStorage.setItem('loginMode', mode);
}

document.getElementById('showSignupLink')?.addEventListener('click', event => {
    event.preventDefault();
    setLoginMode('student');
    document.getElementById('loginError')?.classList.remove('show');
    showScreen('signupScreen');
});

document.getElementById('showLoginLink')?.addEventListener('click', event => {
    event.preventDefault();
    setLoginMode('student');
    document.getElementById('signupError')?.classList.remove('show');
    document.getElementById('signupSuccess')?.classList.remove('show');
    showScreen('loginScreen');
});

document.getElementById('showStaffLoginLink')?.addEventListener('click', event => {
    event.preventDefault();
    setLoginMode('staff');
    document.getElementById('loginError')?.classList.remove('show');
    showScreen('staffLoginScreen');
});

document.getElementById('showStudentLoginLink')?.addEventListener('click', event => {
    event.preventDefault();
    setLoginMode('student');
    document.getElementById('staffLoginError')?.classList.remove('show');
    showScreen('loginScreen');
});

document.getElementById('showResetPasswordLink')?.addEventListener('click', event => {
    event.preventDefault();
    setLoginMode('student');
    document.getElementById('loginError')?.classList.remove('show');
    document.getElementById('resetPasswordForm')?.reset();
    document.getElementById('resetPasswordError')?.classList.remove('show');
    document.getElementById('resetPasswordSuccess')?.classList.remove('show');
    showScreen('resetPasswordScreen');
});

document.getElementById('backFromChangePasswordLink')?.addEventListener('click', async event => {
    event.preventDefault();
    const auth = window.firebaseAuth;
    if (auth?.currentUser) {
        await auth.signOut();
    }
    const loginMode = sessionStorage.getItem('loginMode') === 'staff' ? 'staff' : 'student';
    setLoginMode(loginMode);
    document.getElementById('changePasswordForm')?.reset();
    document.getElementById('changePasswordError')?.classList.remove('show');
    showScreen(loginMode === 'staff' ? 'staffLoginScreen' : 'loginScreen');
});
