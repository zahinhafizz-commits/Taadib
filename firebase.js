import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword, 
    updatePassword,
    sendPasswordResetEmail,
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc,
    doc, 
    setDoc,
    updateDoc,
    query,
    where,
    limit
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Firebase credentials
const firebaseConfig = {
    apiKey: "AIzaSyAd99msyNGPIdBX9PgK35sPstPWI9KZ6O4",
    authDomain: "system-fyp.firebaseapp.com",
    projectId: "system-fyp",
    storageBucket: "system-fyp.firebasestorage.app",
    messagingSenderId: "827409920747",
    appId: "1:827409920747:web:c77597d81d83d288ddc4ae",
    measurementId: "G-32P8ZZN0B0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Global Variables
let currentRole = 'pelajar';
let currentUserData = null;
let studentList = [];
let reportsData = [];
let allReportsData = null;
const studentReportsCache = new Map();
let isSigningUp = false;
const STUDENT_BASE_PASSWORD = '123456';
const STUDENT_PASSWORD_RESET_REQUESTS_COLLECTION = 'password_reset_requests';
let dataLoaded = {
    students: false,
    reports: false
};

function normalizeRole(role) {
    const value = (role || '').toString().trim().toLowerCase();

    if (['student', 'pelajar', 'peserta', 'student_tadib'].includes(value)) return 'pelajar';
    if (['warden', 'warden_tadib', 'penjaga', 'supervisor', 'hep', 'hep_tadib', 'office'].includes(value)) return 'warden';
    if (['admin', 'administrator', 'rollcall_admin', 'roll-call-admin', 'roll call admin'].includes(value)) return 'admin';

    return 'pelajar';
}

// DOM References
const loginScreen = document.getElementById('loginScreen');
const dashboardScreen = document.getElementById('dashboardScreen');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const errorText = document.getElementById('errorText');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const signupScreen = document.getElementById('signupScreen');
const signupForm = document.getElementById('signupForm');
const signupMatrixInput = document.getElementById('signupMatrix');
const signupPasswordInput = document.getElementById('signupPassword');
const signupConfirmPasswordInput = document.getElementById('signupConfirmPassword');
const signupError = document.getElementById('signupError');
const signupErrorText = document.getElementById('signupErrorText');
const staffLoginForm = document.getElementById('staffLoginForm');
const staffLoginError = document.getElementById('staffLoginError');
const staffErrorText = document.getElementById('staffErrorText');
const changePasswordForm = document.getElementById('changePasswordForm');
const changePasswordError = document.getElementById('changePasswordError');
const changePasswordErrorText = document.getElementById('changePasswordErrorText');
const newPasswordInput = document.getElementById('newPassword');
const confirmNewPasswordInput = document.getElementById('confirmNewPassword');
const resetPasswordForm = document.getElementById('resetPasswordForm');
const resetPasswordIdentityInput = document.getElementById('resetPasswordIdentity');
const resetPasswordError = document.getElementById('resetPasswordError');
const resetPasswordErrorText = document.getElementById('resetPasswordErrorText');
const resetPasswordSuccess = document.getElementById('resetPasswordSuccess');
const resetPasswordSuccessText = document.getElementById('resetPasswordSuccessText');
const firstTimeUserScreen = document.getElementById('firstTimeUserScreen');
const firstTimeUserForm = document.getElementById('firstTimeUserForm');
const firstTimeUserMatrixInput = document.getElementById('firstTimeUserMatrix');
const firstTimeUserError = document.getElementById('firstTimeUserError');
const firstTimeUserErrorText = document.getElementById('firstTimeUserErrorText');
const firstTimeUserSuccess = document.getElementById('firstTimeUserSuccess');
const firstTimeUserSuccessText = document.getElementById('firstTimeUserSuccessText');

function normalizeMatrix(matrix) {
    return (matrix || '').toString().trim().replace(/\s+/g, '').toUpperCase();
}

async function getStudentPassword(matrix) {
    const cleanMatrix = normalizeMatrix(matrix);
    const userQuery = query(collection(db, 'users'), where('no_matriks', '==', cleanMatrix), limit(1));
    const matches = await getDocs(userQuery);
    if (!matches.empty) {
        const userData = matches.docs[0].data();
        return userData.password || STUDENT_BASE_PASSWORD;
    }
    return STUDENT_BASE_PASSWORD;
}

async function saveStudentPassword(matrix, password = STUDENT_BASE_PASSWORD, passwordChanged = false) {
    const cleanMatrix = normalizeMatrix(matrix);
    const userQuery = query(collection(db, 'users'), where('no_matriks', '==', cleanMatrix), limit(1));
    const matches = await getDocs(userQuery);

    if (!matches.empty) {
        const userDoc = matches.docs[0];
        await updateDoc(userDoc.ref, {
            password,
            passwordChanged,
            updatedAt: new Date().toISOString()
        });
        return;
    }

    await setDoc(doc(db, 'users', cleanMatrix), {
        no_matriks: cleanMatrix,
        password,
        passwordChanged,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
}

async function createStudentPasswordRequest(matrix) {
    const cleanMatrix = normalizeMatrix(matrix);
    const student = await getStudentByMatrixID(cleanMatrix);
    if (!student) {
        throw new Error('Pelajar tidak dijumpai.');
    }

    const requestDoc = {
        no_matriks: cleanMatrix,
        nama: student.nama || student.name || '',
        status: 'pending',
        requestedAt: new Date().toISOString(),
        requestedBy: cleanMatrix,
        resetBy: 'warden'
    };

    await addDoc(collection(db, STUDENT_PASSWORD_RESET_REQUESTS_COLLECTION), requestDoc);
    return requestDoc;
}

async function approveStudentPasswordReset(requestId) {
    const requestRef = doc(db, STUDENT_PASSWORD_RESET_REQUESTS_COLLECTION, requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) return;

    const request = requestSnap.data();
    const matrix = normalizeMatrix(request.no_matriks);

    await saveStudentPassword(matrix, STUDENT_BASE_PASSWORD, false);

    const requestUserQuery = query(collection(db, 'users'), where('no_matriks', '==', matrix), limit(1));
    const userMatches = await getDocs(requestUserQuery);
    if (!userMatches.empty) {
        const userDoc = userMatches.docs[0];
        await updateDoc(userDoc.ref, { passwordChanged: false });
    }

    await updateDoc(requestRef, {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: currentUserData?.nama || 'Warden'
    });
}

async function getStudentPasswordResetRequests() {
    const snapshot = await getDocs(collection(db, STUDENT_PASSWORD_RESET_REQUESTS_COLLECTION));
    return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

async function signInWithMatrixOrEmail(identity, password) {
    const matrix = normalizeMatrix(identity);
    if (!matrix) {
        throw new Error('Masukkan no. matriks.');
    }

    const student = await getStudentByMatrixID(matrix);
    if (!student) {
        throw new Error('No. matriks tidak dijumpai dalam pangkalan data pelajar.');
    }

    const userQuery = query(collection(db, 'users'), where('no_matriks', '==', matrix), limit(1));
    const userMatches = await getDocs(userQuery);
    const storedPassword = userMatches.empty
        ? STUDENT_BASE_PASSWORD
        : (userMatches.docs[0].data().password || STUDENT_BASE_PASSWORD);

    const internalStudentEmail = `${matrix.toLowerCase()}@tadib.com`;
    const passwordCandidates = [
        password,
        storedPassword,
        STUDENT_BASE_PASSWORD
    ].filter((value, index, arr) => value && arr.indexOf(value) === index);

    let lastError = null;

    for (const candidate of passwordCandidates) {
        try {
            await signInWithEmailAndPassword(auth, internalStudentEmail, candidate);
            return;
        } catch (err) {
            lastError = err;
            console.error('Student matrix sign-in failed with candidate:', candidate, err);

            if (err?.code === 'auth/user-not-found') {
                try {
                    const credential = await createUserWithEmailAndPassword(auth, internalStudentEmail, STUDENT_BASE_PASSWORD);
                    await setDoc(doc(db, 'users', credential.user.uid), {
                        ...student,
                        no_matriks: matrix,
                        role: 'pelajar',
                        password: STUDENT_BASE_PASSWORD,
                        passwordChanged: false
                    });
                    return;
                } catch (createErr) {
                    console.error('Student first-user creation failed:', createErr);
                    if (createErr?.code === 'auth/email-already-in-use') {
                        try {
                            await signInWithEmailAndPassword(auth, internalStudentEmail, STUDENT_BASE_PASSWORD);
                            return;
                        } catch {
                            // Continue to the next password candidate.
                        }
                    } else {
                        throw createErr;
                    }
                }
            }

            if (err?.code !== 'auth/wrong-password' && err?.code !== 'auth/user-not-found') {
                throw err;
            }
        }
    }

    throw lastError || new Error('Log masuk gagal.');
}

async function createStudentAccount(matrix, password) {
    const internalStudentEmail = `${normalizeMatrix(matrix).toLowerCase()}@tadib.com`;
    try {
        return await createUserWithEmailAndPassword(auth, internalStudentEmail, password);
    } catch (err) {
        if (err?.code === 'auth/email-already-in-use') {
            throw err;
        }
        throw err;
    }
}

async function createFirstTimeStudentPage(matrix) {
    const cleanMatrix = normalizeMatrix(matrix);
    const student = await getStudentByMatrixID(cleanMatrix);
    if (!student) {
        throw Object.assign(new Error('Pelajar tidak dijumpai.'), { code: 'student/not-found' });
    }

    const userQuery = query(collection(db, 'users'), where('no_matriks', '==', cleanMatrix), limit(1));
    const userMatches = await getDocs(userQuery);
    if (!userMatches.empty) {
        throw Object.assign(new Error('Pelajar sudah mempunyai halaman akaun.'), { code: 'user-page-already-exists' });
    }

    const internalStudentEmail = `${cleanMatrix.toLowerCase()}@tadib.com`;
    const credential = await createUserWithEmailAndPassword(auth, internalStudentEmail, STUDENT_BASE_PASSWORD);
    await setDoc(doc(db, 'users', credential.user.uid), {
        ...student,
        no_matriks: cleanMatrix,
        role: 'pelajar',
        password: STUDENT_BASE_PASSWORD,
        passwordChanged: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });

    await signOut(auth);
    return credential.user;
}

firstTimeUserForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    firstTimeUserError?.classList.remove('show');
    firstTimeUserSuccess?.classList.remove('show');

    try {
        const matrix = normalizeMatrix(firstTimeUserMatrixInput.value);
        if (!matrix) {
            throw Object.assign(new Error('Masukkan no. matriks.'), { code: 'missing-matrix' });
        }

        await createFirstTimeStudentPage(matrix);
        firstTimeUserSuccessText.textContent = 'Halaman pelajar telah dicipta. Sila log masuk dengan nombor matriks anda.';
        firstTimeUserSuccess?.classList.add('show');
        firstTimeUserForm.reset();
        showScreen('loginScreen');
    } catch (err) {
        console.error('First-time user setup failed:', err);
        const message = err?.code === 'student/not-found'
            ? 'No. matriks tidak dijumpai dalam pangkalan data pelajar.'
            : err?.code === 'user-page-already-exists'
                ? 'Pelajar sudah mempunyai halaman akaun. Sila log masuk dengan nombor matriks anda.'
                : 'Pendaftaran pelajar baru gagal. Sila cuba lagi.';
        firstTimeUserErrorText.textContent = message;
        firstTimeUserError?.classList.add('show');
    }
});

function showAuthError(element, textElement, message) {
    textElement.textContent = message;
    element.classList.add('show');
}

document.getElementById('showSignupLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    loginError.classList.remove('show');
    showScreen('signupScreen');
});

document.getElementById('showLoginLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    signupError?.classList.remove('show');
    document.getElementById('signupSuccess')?.classList.remove('show');
    showScreen('loginScreen');
});

document.getElementById('showStaffLoginLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    loginError.classList.remove('show');
    showScreen('staffLoginScreen');
});

document.getElementById('showResetPasswordLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    loginError.classList.remove('show');
    resetPasswordForm?.reset();
    resetPasswordError?.classList.remove('show');
    resetPasswordSuccess?.classList.remove('show');
    showScreen('resetPasswordScreen');
});

document.getElementById('showFirstTimeUserLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    loginError?.classList.remove('show');
    firstTimeUserError?.classList.remove('show');
    firstTimeUserSuccess?.classList.remove('show');
    firstTimeUserForm?.reset();
    showScreen('firstTimeUserScreen');
});

document.getElementById('showLoginFromFirstTimeUserLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    firstTimeUserError?.classList.remove('show');
    firstTimeUserSuccess?.classList.remove('show');
    firstTimeUserForm?.reset();
    showScreen('loginScreen');
});

document.getElementById('showLoginFromResetLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    resetPasswordError?.classList.remove('show');
    resetPasswordSuccess?.classList.remove('show');
    showScreen('loginScreen');
});

document.getElementById('showStudentLoginLink')?.addEventListener('click', (event) => {
    event.preventDefault();
    staffLoginError?.classList.remove('show');
    showScreen('loginScreen');
});

// ==========================================
// 1. AUTHENTICATION & LOGIN OBSERVER
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (isSigningUp) return;
        const fallbackRole = 'pelajar';

        try {
            // First try to get user by UID
            let userDoc = await getDoc(doc(db, "users", user.uid));
            
            // If not found by UID, try to get user by email (for warden users)
            if (!userDoc.exists()) {
                userDoc = await getDoc(doc(db, "users", user.email));
            }
            
            const matrix = (user.email || '').split('@')[0].toUpperCase();
            const studentProfile = await getStudentByMatrixID(matrix);
            
            if (userDoc.exists()) {
                const userData = userDoc.data();
                currentUserData = {
                    ...userData,
                    ...studentProfile,
                    id: studentProfile?.id || userData.id || userDoc.id
                };
                currentUserData.no_matriks = studentProfile?.no_matriks || currentUserData.no_matriks || currentUserData.id || matrix;
                // For warden, use the name field; for students, use nama field
                currentUserData.nama = currentUserData.name || studentProfile?.nama || currentUserData.nama || currentUserData.id || matrix;
                currentUserData.jabatan = getJabatanFromMatrix(currentUserData.no_matriks, studentProfile?.jabatan || currentUserData.jabatan || 'N/A');
                currentRole = normalizeRole(currentUserData.role || fallbackRole);
            } else {
                currentUserData = {
                    ...studentProfile,
                    nama: studentProfile?.nama || matrix,
                    no_matriks: studentProfile?.no_matriks || studentProfile?.id || matrix,
                    role: fallbackRole,
                    jabatan: getJabatanFromMatrix(studentProfile?.no_matriks || studentProfile?.id || matrix, studentProfile?.jabatan || 'N/A'),
                    blok_asrama: 'Blok A',
                    status_amaran: 'Tiada Amaran',
                    markah_disiplin: 100
                };
                currentRole = normalizeRole(currentUserData.role);
            }
        } catch (e) {
            console.error("Error fetching user profile:", e);
            currentRole = fallbackRole;
        }

        if (currentRole === 'pelajar' && currentUserData?.passwordChanged !== true) {
            showScreen('changePasswordScreen');
            return;
        }

        showDashboard();
    } else {
        showScreen('loginScreen');
    }
});

function showDashboard() {
    document.getElementById("sidebarUserName").textContent = currentUserData?.nama || auth.currentUser?.email;
        document.getElementById("sidebarUserRole").textContent = currentRole.toUpperCase();
        document.getElementById("roleLabel").textContent = currentRole.toUpperCase();

        showScreen('dashboardScreen');
        renderSidebarNavigation(currentRole);
        loadPanelContent(currentRole === 'pelajar' ? 'rekodSaya' : currentRole === 'admin' ? 'adminPanel' : 'senaraiPelajar');
}

loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
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

    try {
        await signInWithEmailAndPassword(
            auth,
            document.getElementById('staffEmail').value.trim(),
            document.getElementById('staffPassword').value
        );
    } catch (err) {
        console.error('Staff login failed:', err);
        showAuthError(staffLoginError, staffErrorText, 'Log masuk gagal: Sila semak emel dan kata laluan staf.');
    }
});

async function sendAccountPasswordReset(identity) {
    const value = identity.trim();
    if (!value) {
        throw new Error('Masukkan no. matriks atau emel.');
    }

    if (value.includes('@')) {
        await sendPasswordResetEmail(auth, value.toLowerCase());
        return value.toLowerCase();
    }

    const matrix = normalizeMatrix(value);
    const student = await getStudentByMatrixID(matrix);
    if (!student) {
        const error = new Error('Pelajar tidak dijumpai.');
        error.code = 'student/not-found';
        throw error;
    }

    const email = `${matrix.toLowerCase()}@tadib.com`;
    await sendPasswordResetEmail(auth, email);
    return email;
}

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

        isSigningUp = true;
        const credential = await createStudentAccount(matrix, password);
        await setDoc(doc(db, 'users', credential.user.uid), {
            ...student,
            no_matriks: matrix,
            role: 'pelajar',
            passwordChanged: true
        });
        await saveStudentPassword(matrix, password, true);
        await signOut(auth);
        isSigningUp = false;
        signupForm.reset();
        document.getElementById('signupSuccess')?.classList.add('show');
        showScreen('loginScreen');
    } catch (err) {
        isSigningUp = false;
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
    if (newPassword.length < 6) {
        showAuthError(changePasswordError, changePasswordErrorText, 'Kata laluan mesti mempunyai sekurang-kurangnya 6 aksara.');
        return;
    }
    if (newPassword !== confirmPassword) {
        showAuthError(changePasswordError, changePasswordErrorText, 'Kata laluan tidak sepadan.');
        return;
    }

    try {
        await updatePassword(auth.currentUser, newPassword);
        await updateDoc(doc(db, 'users', auth.currentUser.uid), { passwordChanged: true });
        await saveStudentPassword(currentUserData?.no_matriks || auth.currentUser?.email, newPassword, true);
        currentUserData.passwordChanged = true;
        changePasswordForm.reset();
        showDashboard();
    } catch (err) {
        console.error('Password update failed:', err);
        showAuthError(changePasswordError, changePasswordErrorText, 'Kata laluan gagal dikemas kini. Sila log masuk semula dan cuba lagi.');
    }
});

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId)?.classList.add('active');
}

const jabatanMappingByCourse = {
    DAC: 'JP',
    DAD: 'JKM',
    DEE: 'JKE',
    DEM: 'JKM',
    DEP: 'JKE',
    DFI: 'JP',
    DGU: 'JKA',
    DIF: 'JP',
    DIT: 'JTMK',
    DKA: 'JKA',
    DKM: 'JKM',
    DKP: 'JKP',
    DPM: 'JP',
    DPU: 'JKM',
    DRM: 'JP',
    DSB: 'JKA',
    DTK: 'JKE',
    KPB: 'JKA'
};

function getJabatanFromMatrix(matrix, fallback = 'N/A') {
    const value = (matrix || '').toString().toUpperCase().trim();
    if (!value) return fallback;

    const directMatch = value.match(/(?:^|01)([A-Z]{3})(?:\d|$)/);
    const programCode = directMatch ? directMatch[1] : value.match(/^([A-Z]{3})/)?.[1] || null;

    if (programCode && jabatanMappingByCourse[programCode]) {
        return jabatanMappingByCourse[programCode];
    }

    const legacyMatch = value.match(/01([A-Z]{3})/) || value.match(/^\d{2}([A-Z]{3})/);
    return legacyMatch ? legacyMatch[1] : fallback;
}

// ==========================================
// 2. DATA FETCHING (SORTED BY MATRIX NUMBER)
// ==========================================
async function fetchStudentList() {
    if (dataLoaded.students) return;
    try {
        const querySnapshot = await getDocs(collection(db, "students"));
        studentList = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            return {
                ...data,
                id: docSnap.id,
                no_matriks: (data.matrix_no || data.no_matriks || docSnap.id).toString().toUpperCase(),
                nama: data.name || data.nama || data.nama_pelajar || "N/A",
                jabatan: getJabatanFromMatrix(data.matrix_no || data.no_matriks || docSnap.id, data.jabatan || "N/A"),
                blok_asrama: data.blok_asrama || data.block || data.blok || "-",
                room_no: data.room_no || "-",
                bed_no: data.bed_no ?? "-",
                status_amaran: data.status_amaran || "Tiada Amaran",
                markah_disiplin: data.markah_disiplin ?? 100
            };
        });
        studentList.sort((firstStudent, secondStudent) => firstStudent.no_matriks.localeCompare(secondStudent.no_matriks));
        dataLoaded.students = true;
        syncStudentMeritScores();
    } catch (err) {
        console.error("Ralat mengambil senarai pelajar:", err);
    }
}

async function fetchReportsData(filterMatrix = null, pageSize = 200) {
    const normalizedMatrix = filterMatrix?.trim().toUpperCase() || null;
    if (normalizedMatrix && studentReportsCache.has(normalizedMatrix)) {
        reportsData = studentReportsCache.get(normalizedMatrix);
        return;
    }
    if (!normalizedMatrix && allReportsData) {
        reportsData = allReportsData;
        dataLoaded.reports = true;
        return;
    }

    try {
        let querySnapshot;
        if (normalizedMatrix) {
            const q = query(collection(db, "laporan"), where("no_matriks", "==", normalizedMatrix), limit(pageSize));
            querySnapshot = await getDocs(q);
        } else {
            querySnapshot = await getDocs(query(collection(db, "laporan"), limit(pageSize)));
        }
        reportsData = querySnapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        reportsData.sort((a, b) => new Date(b.tarikh || 0) - new Date(a.tarikh || 0));
        if (normalizedMatrix) {
            studentReportsCache.set(normalizedMatrix, reportsData);
        } else {
            allReportsData = reportsData;
            dataLoaded.reports = true;
        }
    } catch (err) {
        console.error("Ralat mengambil senarai laporan:", err);
    }
}

async function getStudentByMatrixID(matriksId) {
    if (!matriksId) return null;
    const cleanId = matriksId.trim().toUpperCase();
    
    const local = studentList.find(s => s.no_matriks === cleanId);
    if (local) return local;

    try {
        const studentDoc = await getDoc(doc(db, "students", cleanId));
        if (studentDoc.exists()) {
            const data = studentDoc.data();
            return {
                ...data,
                id: studentDoc.id,
                no_matriks: (data.matrix_no || data.no_matriks || studentDoc.id).toString().toUpperCase(),
                nama: data.name || data.nama || data.nama_pelajar || "",
                jabatan: getJabatanFromMatrix(data.matrix_no || data.no_matriks || studentDoc.id, data.jabatan || "N/A"),
                blok_asrama: data.blok_asrama || data.block || "-",
                room_no: data.room_no || "-",
                bed_no: data.bed_no ?? "-",
                semester: data.semester || "-",
                status_amaran: data.status_amaran || "Tiada Amaran",
                markah_disiplin: data.markah_disiplin ?? 100
            };
        }

        const studentQuery = query(collection(db, "students"), where("matrix_no", "==", cleanId), limit(1));
        const studentMatches = await getDocs(studentQuery);
        if (!studentMatches.empty) {
            const matchingDoc = studentMatches.docs[0];
            const data = matchingDoc.data();
            return {
                ...data,
                id: matchingDoc.id,
                no_matriks: (data.matrix_no || data.no_matriks || cleanId).toString().toUpperCase(),
                nama: data.name || data.nama || data.nama_pelajar || "",
                jabatan: getJabatanFromMatrix(data.matrix_no || data.no_matriks || cleanId, data.jabatan || "N/A"),
                blok_asrama: data.blok_asrama || data.block || "-",
                room_no: data.room_no || "-",
                bed_no: data.bed_no ?? "-",
                semester: data.semester || "-",
                status_amaran: data.status_amaran || "Tiada Amaran",
                markah_disiplin: data.markah_disiplin ?? 100
            };
        }
    } catch (e) {
        console.error("Firestore student lookup error:", e);
    }
    return null;
}

const kategoriKesGroups = {
    "Kesalahan Keselamatan & Fizikal (Tindakan Serius)": [
        "Membawa Senjata",
        "Buli / Ragging",
        "Bahaya Kebakaran",
        "Pencerobohan Kawasan Larangan"
    ],
    "Kesalahan Etika & Pergaulan": [
        "Pergaulan Bebas",
        "Tetamu Unsuransurans / Menumpang",
        "Penyertaan Haram",
        "Perhimpunan Tanpa Kebenaran"
    ],
    "Kesalahan Pemilikan & Barangan Larangan": [
        "Memelihara Haiwan",
        "Peralatan Elektrik & Pendawaian",
        "Makanan Non-Halal"
    ],
    "Kesalahan Pakaian, Diri & Pengurusan Bilik": [
        "Pakaian Tidak Sopan",
        "Rambut & Perhiasan",
        "Memasak & Kebersihan"
    ],
    "Kesalahan Pergerakan, Berniaga & Pentadbiran": [
        "Melanggar Syarat Pergerakan",
        "Berniaga Tanpa Kebenaran",
        "Tukar Bilik Sendiri"
    ]
};

function getStatusBadgeClass(status) {
    if (!status) return "status-none";
    const s = status.toLowerCase();
    if (s.includes("terakhir")) return "status-terakhir";
    if (s.includes("kedua")) return "status-kedua";
    if (s.includes("pertama")) return "status-pertama";
    return "status-none";
}

function getMeritBadgeTier(score) {
    const value = Number(score ?? 100);
    if (Number.isNaN(value)) return {
        key: 'probation',
        label: 'Probation Tier',
        icon: '⚠',
        className: 'merit-tier-probation',
        description: 'Risiko kehilangan tempat tinggal dan perlu penyeliaan lanjut.',
        privilege: 'Risiko penilaian disiplin',
        min: 0,
        max: 49
    };

    if (value >= 90) return {
        key: 'model',
        label: 'Model Resident',
        icon: '🏅',
        className: 'merit-tier-model',
        description: 'Pelajar cemerlang dengan komitmen tinggi terhadap peraturan dan aktiviti Kamsis.',
        privilege: 'Keutamaan untuk penempatan hostel dan kelulusan khas.',
        min: 90,
        max: 100
    };

    if (value >= 75) return {
        key: 'good',
        label: 'Good Standing',
        icon: '✅',
        className: 'merit-tier-good',
        description: 'Pelajar berada dalam keadaan baik dan layak menikmati akses penuh ke kemudahan.',
        privilege: 'Status standard Kamsis dan akses penuh.',
        min: 75,
        max: 89
    };

    if (value >= 50) return {
        key: 'warning',
        label: 'Warning Tier',
        icon: '🟡',
        className: 'merit-tier-warning',
        description: 'Amaran ringan. Prioriti penempatan masa depan berkurang.',
        privilege: 'Perhatian dan nasihat disiplin diperlukan.',
        min: 50,
        max: 74
    };

    return {
        key: 'probation',
        label: 'Probation Tier',
        icon: '🔴',
        className: 'merit-tier-probation',
        description: 'Berisiko menerima tindakan disiplin dan kehilangan tempat tinggal.',
        privilege: 'Membawa kepada review dan pemantauan rapi.',
        min: 0,
        max: 49
    };
}

function renderMeritBadge(score) {
    const badge = getMeritBadgeTier(score);
    return `
        <button type="button" class="merit-badge ${badge.className}" data-badge-score="${Number(score ?? 100)}">
            <span>${badge.icon}</span>
            <span>${badge.label}</span>
        </button>
    `;
}

function formatProfileLabel(key) {
    const labels = {
        matrix_no: 'No. Matriks',
        no_matriks: 'No. Matriks',
        ic_no: 'No. Kad Pengenalan',
        name: 'Nama',
        nama: 'Nama',
        room_no: 'No. Bilik',
        bed_no: 'No. Katil',
        semester: 'Semester',
        block: 'Blok Asrama',
        blok_asrama: 'Blok Asrama',
        jabatan: 'Jabatan',
        status_amaran: 'Status Amaran'
    };
    return labels[key] || key.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatProfileValue(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function renderStudentProfileFields(student) {
    const hiddenFields = new Set([
        'id', 'role', 'markah_disiplin', 'uid', 'passwordChanged',
        'matrix_no', 'name', 'nama_pelajar',
        'block', 'blok', 'status_amaran'
    ]);
    const preferredFields = ['nama', 'no_matriks', 'ic_no', 'jabatan', 'blok_asrama', 'room_no', 'bed_no', 'semester'];
    const profileEntries = preferredFields
        .filter(key => student?.[key] !== undefined && student?.[key] !== null)
        .map(key => [key, student[key]])
        .concat(Object.entries(student || {}).filter(([key]) => !hiddenFields.has(key) && !preferredFields.includes(key)));

    return profileEntries
        .map(([key, value]) => `
            <div class="profile-field">
                <strong>${formatProfileLabel(key)}:</strong>
                <div>${formatProfileValue(value)}</div>
            </div>
        `).join('');
}

function getReportMeritImpact(report) {
    const category = (report?.kategori_kes || '').toLowerCase();
    const status = (report?.status_amaran || '').toLowerCase();

    if (category.includes('lewat') || category.includes('late') || category.includes('ponteng')) return -12;
    if (category.includes('kebersihan') || category.includes('bersih')) return -10;
    if (category.includes('elektrik') || category.includes('alat')) return -14;
    if (category.includes('program') || category.includes('aktiviti') || category.includes('sokongan')) return 8;
    if (status.includes('terakhir')) return -12;
    if (status.includes('kedua')) return -8;
    if (status.includes('pertama')) return -5;
    return 0;
}

function calculateStudentMeritScore(studentNo) {
    const normalized = (studentNo || '').toString().trim().toUpperCase();
    if (!normalized) return 100;

    const total = reportsData
        .filter(r => r.no_matriks && r.no_matriks.toUpperCase() === normalized)
        .reduce((sum, report) => sum + getReportMeritImpact(report), 100);

    return Math.min(100, Math.max(0, total));
}

function syncStudentMeritScores() {
    studentList = studentList.map(student => {
        const score = calculateStudentMeritScore(student.no_matriks);
        return { ...student, markah_disiplin: score };
    });

    if (currentUserData?.no_matriks) {
        currentUserData.markah_disiplin = calculateStudentMeritScore(currentUserData.no_matriks);
    }
}

function renderMeritLegend() {
    return `
        <div class="merit-legend">
            <div class="merit-legend-item merit-tier-model"><span>🏅</span> Model Resident (90-100)</div>
            <div class="merit-legend-item merit-tier-good"><span>✅</span> Good Standing (75-89)</div>
            <div class="merit-legend-item merit-tier-warning"><span>🟡</span> Warning Tier (50-74)</div>
            <div class="merit-legend-item merit-tier-probation"><span>🔴</span> Probation Tier (0-49)</div>
        </div>
    `;
}

function renderOtherMeritTiers(currentKey) {
    const tiers = [
        ['model', 100],
        ['good', 89],
        ['warning', 74],
        ['probation', 49]
    ];

    return tiers
        .map(([, score]) => {
            const tier = getMeritBadgeTier(score);
            return `
                <div class="merit-other-tier">
                    <button type="button" class="merit-badge ${tier.className}" data-badge-score="${score}">
                        <span>${tier.icon}</span>
                        <span>${tier.label} (${tier.min}-${tier.max})</span>
                    </button>
                    <span class="merit-other-tier-description">${tier.description}</span>
                </div>
            `;
        })
        .join('');
}

function showBadgeDetails(score) {
    const badge = getMeritBadgeTier(score);
    const modal = document.getElementById('meritBadgeModal');
    if (!modal) return;

    modal.innerHTML = `
        <div class="merit-modal-card">
            <div class="merit-modal-header">
                <div>
                    <div class="merit-modal-kicker">Merit Status</div>
                    <h4>${badge.label}</h4>
                </div>
                <button type="button" class="merit-modal-close" aria-label="Tutup">×</button>
            </div>

            <div class="merit-modal-score">
                <span class="score-value">${Number(score ?? 100)}</span>
                <span class="score-total">/ 100</span>
            </div>

            <div class="merit-modal-body">
                <div class="merit-detail-box">
                    <strong>Description:</strong>
                    <span>${badge.description}</span>
                </div>
                <div class="merit-detail-box">
                    <strong>Privilege:</strong>
                    <span>${badge.privilege}</span>
                </div>
                <div class="merit-detail-box">
                    <strong>Point Range:</strong>
                    <span>${badge.min} - ${badge.max}</span>
                </div>
                <div class="merit-detail-box">
                    <strong>Merit note:</strong>
                    <span>${score >= 90 ? 'Excellent compliance with Kamsis rules and active participation.' : score >= 75 ? 'Strong standing with regular adherence to residential expectations.' : score >= 50 ? 'Needs improvement and reduced priority for future privileges.' : 'High-risk zone: review and corrective action needed.'}</span>
                </div>
                <strong>Tier badge list:</strong>
                ${renderOtherMeritTiers(badge.key)}
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    modal.querySelector('.merit-modal-close')?.addEventListener('click', () => modal.classList.add('hidden'));
    modal.querySelectorAll('.merit-badge').forEach(button => {
        button.addEventListener('click', (e) => {
            showBadgeDetails(Number(e.currentTarget.dataset.badgeScore || 100));
        });
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
}

function getMeritLedgerEntries(studentNo) {
    const normalized = (studentNo || '').toString().trim().toUpperCase();
    const records = reportsData.filter(r => r.no_matriks && r.no_matriks.toUpperCase() === normalized);

    const deductionMap = {
        'lewat masuk asrama': -12,
        'late return': -12,
        'ketidakhadiran program': -8,
        'tidak hadir program': -8,
        'kebersihan bilik tidak memuaskan': -10,
        'bilik kotor': -10,
        'alat elektrik tidak dibenarkan': -14,
        'lampu rumah tidak dipadam': -7,
        'merokok dalam kawasan asrama': -18,
        'ponteng kelas': -9
    };

    const bonusMap = {
        'penyertaan aktiviti kamsis': 10,
        'program kamsis': 10,
        'kebersihan bilik cemerlang': 8,
        'kesihatan dan kebersihan': 7,
        'penglibatan komuniti': 6,
        'sokongan program asrama': 9
    };

    const ledger = records.map(r => {
        const key = (r.kategori_kes || '').toLowerCase();
        const reason = r.kategori_kes || 'Aktiviti Kamsis';
        const date = r.tarikh || '2026-01-01';
        const pointValue = deductionMap[key] ?? bonusMap[key] ?? (r.status_amaran && r.status_amaran.toLowerCase().includes('terakhir') ? -12 : -5);
        const type = pointValue >= 0 ? 'bonus' : 'deduction';
        return {
            date,
            reason,
            points: Math.abs(pointValue),
            type,
            sign: pointValue >= 0 ? '+' : '-'
        };
    });

    if (!ledger.length) {
        ledger.push(
            { date: '2026-08-05', reason: 'Penyertaan Program Kamsis', points: 8, type: 'bonus', sign: '+' },
            { date: '2026-08-09', reason: 'Kebersihan Bilik Cemerlang', points: 6, type: 'bonus', sign: '+' },
            { date: '2026-08-12', reason: 'Lewat Masuk Asrama', points: 12, type: 'deduction', sign: '-' }
        );
    }

    return ledger.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
}

// Helper perantara untuk terus buka borang kes bagi pelajar tertentu
window.bukaDaftarKesPelajar = function(matriks) {
    loadPanelContent('daftarKesBaru', matriks);
};

// ==========================================
// 3. NAVIGATION MENU (SIDEBAR WARDEN & HEP)
// ==========================================
function renderSidebarNavigation(role) {
    const navMenu = document.getElementById("navMenu");
    if (!navMenu) return;

    let navHTML = "";

    if (role === 'warden') {
        navHTML += `<button class="nav-item active" data-panel="dashboard"><i class="fas fa-chart-pie"></i> Dashboard</button>`;
        navHTML += `<button class="nav-item" data-panel="senaraiKes"><i class="fas fa-file-medical"></i> Daftar Kes</button>`;
        navHTML += `<button class="nav-item" data-panel="laporan"><i class="fas fa-plus-circle"></i> Laporan Kes</button>`;
        navHTML += `<button class="nav-item" data-panel="senaraiPelajar"><i class="fas fa-users"></i> Status Pelajar</button>`;
        navHTML += `<button class="nav-item" data-panel="resetPassword"><i class="fas fa-key"></i> Reset Kata Laluan</button>`;
    } else if (role === 'admin') {
        navHTML += `<button class="nav-item active" data-panel="adminPanel"><i class="fas fa-user-shield"></i> Admin</button>`;
    } else {
        navHTML += `<button class="nav-item active" data-panel="rekodSaya"><i class="fas fa-user-shield"></i> Rekod Disiplin Saya</button>`;
    }

    navMenu.innerHTML = navHTML;

    const logoutBtn = document.createElement('button');
    logoutBtn.className = 'nav-item logout-btn';
    logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Log Keluar';
    logoutBtn.addEventListener('click', () => signOut(auth));
    navMenu.appendChild(logoutBtn);

    document.querySelectorAll(".nav-item[data-panel]").forEach(button => {
        button.addEventListener("click", (e) => {
            document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
            const targetBtn = e.currentTarget;
            targetBtn.classList.add("active");
            loadPanelContent(targetBtn.getAttribute("data-panel"));
        });
    });
}

// ==========================================
// 4. DYNAMIC PANEL ROUTER
// ==========================================
async function loadPanelContent(panelName, targetMatriks = null) {
    const contentPanel = document.getElementById("contentPanels");
    const pageTitleText = document.getElementById("pageTitleText");

    document.querySelectorAll(".nav-item[data-panel]").forEach(button => {
        button.classList.toggle("active", button.getAttribute("data-panel") === panelName);
    });

    if (!contentPanel) return;

    if (panelName === "adminPanel") {
        if (pageTitleText) pageTitleText.textContent = "Pentadbir Roll Call";

        contentPanel.innerHTML = `
            <div class="card-box">
                <h3>Tambah Roll Call Admin</h3>
                <p style="margin: 10px 0 18px; color: #6d5a88;">Cipta akaun baru untuk roll call admin. Kata laluan akan ditetapkan kepada <strong>123</strong>.</p>
                <form id="createRollCallAdminForm" style="display: grid; gap: 16px; max-width: 520px;">
                    <div>
                        <label style="font-weight: 600; display: block; margin-bottom: 6px;">Nama Roll Call Admin</label>
                        <input type="text" id="adminNameInput" class="form-control" placeholder="Contoh: Ahmad Rahman" required>
                    </div>
                    <div>
                        <label style="font-weight: 600; display: block; margin-bottom: 6px;">Emel Roll Call Admin</label>
                        <input type="email" id="adminEmailInput" class="form-control" placeholder="admin@tadib.com" required>
                    </div>
                    <div>
                        <label style="font-weight: 600; display: block; margin-bottom: 6px;">Kata Laluan</label>
                        <input type="text" id="adminPasswordInput" class="form-control" value="123" readonly>
                    </div>
                    <div style="text-align: right;">
                        <button type="submit" class="btn btn-primary"><i class="fas fa-user-plus"></i> Daftar Akaun</button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('createRollCallAdminForm')?.addEventListener('submit', async (event) => {
            event.preventDefault();

            const adminName = document.getElementById('adminNameInput')?.value.trim();
            const adminEmail = document.getElementById('adminEmailInput')?.value.trim();
            const password = '123';

            if (!adminName || !adminEmail) {
                showReportPopup('Data Tidak Lengkap', 'Sila isi nama dan emel roll call admin.', 'error');
                return;
            }

            try {
                const credential = await createUserWithEmailAndPassword(auth, adminEmail, password);
                await setDoc(doc(db, 'users', credential.user.uid), {
                    nama: adminName,
                    email: adminEmail,
                    role: 'rollcall_admin',
                    passwordChanged: true,
                    createdBy: currentUserData?.nama || 'Admin'
                });

                document.getElementById('createRollCallAdminForm')?.reset();
                document.getElementById('adminPasswordInput').value = '123';
                showReportPopup('Akaun Berjaya Dicipta', `Akaun roll call admin ${adminName} telah berjaya ditambah. Kata laluan: 123`, 'success');
            } catch (err) {
                console.error('Create roll call admin failed:', err);
                const message = err.code === 'auth/email-already-in-use'
                    ? 'Emel ini sudah digunakan.'
                    : 'Gagal mencipta akaun roll call admin. Sila cuba lagi.';
                showReportPopup('Gagal Mencipta Akaun', message, 'error');
            }
        });

    // 1. PELAJAR: REKOD DISIPLIN SAYA
    } else if (panelName === "rekodSaya") {
        if (pageTitleText) pageTitleText.textContent = "Rekod Disiplin Saya";

        const userMatriks = currentUserData?.no_matriks || "";
        await fetchReportsData(userMatriks);
        const myReports = reportsData.filter(r => r.no_matriks?.toUpperCase() === userMatriks.toUpperCase());
        currentUserData.jabatan = getJabatanFromMatrix(userMatriks, currentUserData?.jabatan || 'N/A');
        const badgeClass = getStatusBadgeClass(currentUserData?.status_amaran);
        const calculatedScore = calculateStudentMeritScore(userMatriks);
        currentUserData.markah_disiplin = calculatedScore;
        const meritScore = Number(calculatedScore ?? 100);
        const meritBadge = getMeritBadgeTier(meritScore);
        const ledgerEntries = getMeritLedgerEntries(userMatriks);

        contentPanel.innerHTML = `
            <div class="card-box">
                <h3>Profil Pelajar</h3>
                <div class="profile-fields">
                    ${renderStudentProfileFields(currentUserData)}
                    <div class="profile-field"><strong>Status Amaran:</strong> <div><span class="status-badge ${badgeClass}">${currentUserData?.status_amaran || 'Tiada Amaran'}</span></div></div>
                    <div class="profile-field"><strong>Markah Disiplin:</strong> <div>${meritScore} / 100</div></div>
                    <div style="grid-column: 1 / -1;">
                        <strong>Badge Merit:</strong>
                        <div style="margin-top: 10px;">${renderMeritBadge(meritScore)}</div>
                    </div>
                </div>
                <div style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
                    <button class="btn btn-primary" type="button" data-merit-score="${meritScore}"><i class="fas fa-shield-alt"></i> Papar Butiran Badge</button>
                </div>
            </div>

            <div class="card-box">
                <h3>Sejarah Kes Disiplin</h3>
                <div class="table-wrapper" style="margin-top: 15px;">
                    <table>
                        <thead>
                            <tr>
                                <th>Tarikh</th>
                                <th>Kategori Kes</th>
                                <th>Keterangan</th>
                                <th>Gambar Bukti</th>
                                <th>Status Amaran</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${myReports.length ? myReports.map(r => `
                                <tr>
                                    <td>${r.tarikh || '-'}</td>
                                    <td>${r.kategori_kes || '-'}</td>
                                    <td>${r.keterangan || '-'}</td>
                                    <td>${r.gambar_url ? `<a href="${r.gambar_url}" target="_blank"><img src="${r.gambar_url}" style="width:45px; height:45px; object-fit:cover; border-radius:8px;"></a>` : 'Tiada'}</td>
                                    <td><span class="status-badge ${getStatusBadgeClass(r.status_amaran)}">${r.status_amaran || 'Amaran Pertama'}</span></td>
                                </tr>
                            `).join('') : '<tr><td colspan="5" style="text-align:center;">Tiada rekod kesalahan.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card-box">
                <h3>Ledger Merit Pelajar</h3>
                <div class="table-wrapper" style="margin-top: 15px;">
                    <table>
                        <thead>
                            <tr>
                                <th>Tarikh</th>
                                <th>Aktiviti</th>
                                <th>Jenis</th>
                                <th>Nilai</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ledgerEntries.length ? ledgerEntries.map(entry => `
                                <tr>
                                    <td>${entry.date}</td>
                                    <td>${entry.reason}</td>
                                    <td><span class="merit-ledger-pill ${entry.type === 'bonus' ? 'bonus' : 'deduction'}">${entry.type === 'bonus' ? 'Penambahan' : 'Potongan'}</span></td>
                                    <td class="${entry.type === 'bonus' ? 'ledger-positive' : 'ledger-negative'}">${entry.sign} ${entry.points}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="4" style="text-align:center;">Tiada data ledger dijumpai.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style="margin: 4px 0 20px; text-align: right;">
                <button type="button" class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Cetak Laporan Pelajar</button>
            </div>

            <div id="meritBadgeModal" class="merit-modal hidden"></div>
        `;

        document.querySelector('[data-merit-score]')?.addEventListener('click', (e) => {
            showBadgeDetails(Number(e.currentTarget.dataset.meritScore || 100));
        });

        document.querySelectorAll('.merit-badge').forEach(button => {
            button.addEventListener('click', (e) => {
                showBadgeDetails(Number(e.currentTarget.dataset.badgeScore || 100));
            });
        });

    // 2. SENARAI PELAJAR (LAJUR DISENGGARA: STATUS AMARAN DITUKAR KE BUTTON LAPORAN)
    } else if (panelName === "senaraiPelajar") {
        if (pageTitleText) pageTitleText.textContent = "Status Pelajar";
        await fetchStudentList();

        contentPanel.innerHTML = `
            <div class="card-box">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                    <h3>Senarai Pelajar</h3>
                    <div style="display: flex; gap: 10px; width: 100%; max-width: 500px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 200px;">
                            <input type="text" id="studentSearchInput" class="form-control" placeholder="Cari Nama, No. Matriks, Jabatan, Blok...">
                        </div>
                    </div>
                </div>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>No. Matriks</th>
                                <th>Nama Pelajar</th>
                                <th>Jabatan</th>
                                <th>Lokasi Asrama</th>
                                <th>Markah</th>
                                <th>Badge</th>
                            </tr>
                        </thead>
                        <tbody id="studentTableBody">
                            ${renderStudentTableRows(studentList, studentList.length, false)}
                        </tbody>
                    </table>
                </div>
                <div id="studentListControls" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap;"></div>
                <div style="margin-top: 18px; text-align: right;">
                    <button type="button" class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Cetak Laporan</button>
                </div>
            </div>
        `;

        const studentsPerPage = 20;
        let currentStudentPage = 1;

        const renderFilteredStudents = (filtered) => {
            const totalPages = Math.max(1, Math.ceil(filtered.length / studentsPerPage));
            currentStudentPage = Math.min(currentStudentPage, totalPages);
            const firstStudentIndex = (currentStudentPage - 1) * studentsPerPage;
            const pageStudents = filtered.slice(firstStudentIndex, firstStudentIndex + studentsPerPage);
            document.getElementById("studentTableBody").innerHTML = renderStudentTableRows(pageStudents, pageStudents.length, false);

            const controls = document.getElementById("studentListControls");
            if (!controls) return;

            const firstShownStudent = filtered.length ? firstStudentIndex + 1 : 0;
            const lastShownStudent = Math.min(firstStudentIndex + studentsPerPage, filtered.length);
            const pageWindowSize = 10;
            const firstPage = totalPages <= pageWindowSize
                ? 1
                : Math.min(Math.max(1, currentStudentPage - 8), totalPages - pageWindowSize + 1);
            const lastPage = Math.min(firstPage + pageWindowSize - 1, totalPages);
            const pageButtons = Array.from({ length: lastPage - firstPage + 1 }, (_, index) => {
                const pageNumber = firstPage + index;
                const activeClass = pageNumber === currentStudentPage ? " active" : "";
                return `<button type="button" class="btn pagination-btn${activeClass}" data-student-page="${pageNumber}">${pageNumber}</button>`;
            }).join('');
            const previousPage = Math.max(1, currentStudentPage - 1);
            const nextPage = Math.min(totalPages, currentStudentPage + 1);

            controls.innerHTML = `
                <span style="color: #5e7e96; font-size: 14px;">Memaparkan ${firstShownStudent}-${lastShownStudent} daripada ${filtered.length} pelajar</span>
                <div class="pagination-controls" aria-label="Navigasi halaman senarai pelajar">
                    <button type="button" class="btn pagination-btn pagination-boundary-btn" data-student-page="1" aria-label="Halaman pertama" ${currentStudentPage === 1 ? 'disabled' : ''}>First</button>
                    <button type="button" class="btn pagination-btn pagination-arrow-btn" data-student-page="${previousPage}" aria-label="Halaman sebelumnya" ${currentStudentPage === 1 ? 'disabled' : ''}>&lt;</button>
                    ${pageButtons}
                    <button type="button" class="btn pagination-btn pagination-arrow-btn" data-student-page="${nextPage}" aria-label="Halaman seterusnya" ${currentStudentPage === totalPages ? 'disabled' : ''}>&gt;</button>
                    <button type="button" class="btn pagination-btn pagination-boundary-btn" data-student-page="${totalPages}" aria-label="Halaman terakhir" ${currentStudentPage === totalPages ? 'disabled' : ''}>Last</button>
                </div>
            `;

            controls.querySelectorAll("[data-student-page]").forEach(button => {
                button.addEventListener("click", () => {
                    currentStudentPage = Number(button.dataset.studentPage);
                    renderFilteredStudents(filtered);
                });
            });
        };

        const applyStudentFilter = () => {
            const query = document.getElementById("studentSearchInput")?.value.toLowerCase().trim() || "";

            const filtered = studentList.filter(s => matchStudentTableSearch(s, query, true));

            currentStudentPage = 1;
            renderFilteredStudents(filtered);
        };

        document.getElementById("studentSearchInput")?.addEventListener("input", applyStudentFilter);
        renderFilteredStudents(studentList);

    // 3. DAFTAR KES (SALINAN STATUS PELAJAR TANPA MARKAH/BADGE, DENGAN TOMBOL LAPORAN)
    } else if (panelName === "senaraiKes" || panelName === "daftarKes") {
        if (pageTitleText) pageTitleText.textContent = "Daftar Kes";
        await fetchStudentList();

        contentPanel.innerHTML = `
            <div class="card-box">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px;">
                    <h3>Daftar Kes</h3>
                    <div style="display: flex; gap: 10px; width: 100%; max-width: 500px; flex-wrap: wrap;">
                        <div style="flex: 1; min-width: 200px;">
                            <input type="text" id="studentSearchInput" class="form-control" placeholder="Cari Nama, No. Matriks, Jabatan, Blok...">
                        </div>
                    </div>
                </div>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>No. Matriks</th>
                                <th>Nama Pelajar</th>
                                <th>Jabatan</th>
                                <th>Lokasi Asrama</th>
                                <th>Tindakan</th>
                            </tr>
                        </thead>
                        <tbody id="studentTableBody">
                            ${renderStudentTableRows(studentList, studentList.length, true)}
                        </tbody>
                    </table>
                </div>
                <div id="studentListControls" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 16px; flex-wrap: wrap;"></div>
                <div style="margin-top: 18px; text-align: right;">
                    <button type="button" class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Cetak Laporan</button>
                </div>
            </div>
        `;

        const studentsPerPage = 20;
        let currentStudentPage = 1;

        const renderFilteredStudents = (filtered) => {
            const totalPages = Math.max(1, Math.ceil(filtered.length / studentsPerPage));
            currentStudentPage = Math.min(currentStudentPage, totalPages);
            const firstStudentIndex = (currentStudentPage - 1) * studentsPerPage;
            const pageStudents = filtered.slice(firstStudentIndex, firstStudentIndex + studentsPerPage);
            document.getElementById("studentTableBody").innerHTML = renderStudentTableRows(pageStudents, pageStudents.length, true);

            const controls = document.getElementById("studentListControls");
            if (!controls) return;

            const firstShownStudent = filtered.length ? firstStudentIndex + 1 : 0;
            const lastShownStudent = Math.min(firstStudentIndex + studentsPerPage, filtered.length);
            const pageWindowSize = 10;
            const firstPage = totalPages <= pageWindowSize
                ? 1
                : Math.min(Math.max(1, currentStudentPage - 8), totalPages - pageWindowSize + 1);
            const lastPage = Math.min(firstPage + pageWindowSize - 1, totalPages);
            const pageButtons = Array.from({ length: lastPage - firstPage + 1 }, (_, index) => {
                const pageNumber = firstPage + index;
                const activeClass = pageNumber === currentStudentPage ? " active" : "";
                return `<button type="button" class="btn pagination-btn${activeClass}" data-student-page="${pageNumber}">${pageNumber}</button>`;
            }).join('');
            const previousPage = Math.max(1, currentStudentPage - 1);
            const nextPage = Math.min(totalPages, currentStudentPage + 1);

            controls.innerHTML = `
                <span style="color: #5e7e96; font-size: 14px;">Memaparkan ${firstShownStudent}-${lastShownStudent} daripada ${filtered.length} pelajar</span>
                <div class="pagination-controls" aria-label="Navigasi halaman senarai pelajar">
                    <button type="button" class="btn pagination-btn pagination-boundary-btn" data-student-page="1" aria-label="Halaman pertama" ${currentStudentPage === 1 ? 'disabled' : ''}>First</button>
                    <button type="button" class="btn pagination-btn pagination-arrow-btn" data-student-page="${previousPage}" aria-label="Halaman sebelumnya" ${currentStudentPage === 1 ? 'disabled' : ''}>&lt;</button>
                    ${pageButtons}
                    <button type="button" class="btn pagination-btn pagination-arrow-btn" data-student-page="${nextPage}" aria-label="Halaman seterusnya" ${currentStudentPage === totalPages ? 'disabled' : ''}>&gt;</button>
                    <button type="button" class="btn pagination-btn pagination-boundary-btn" data-student-page="${totalPages}" aria-label="Halaman terakhir" ${currentStudentPage === totalPages ? 'disabled' : ''}>Last</button>
                </div>
            `;

            controls.querySelectorAll("[data-student-page]").forEach(button => {
                button.addEventListener("click", () => {
                    currentStudentPage = Number(button.dataset.studentPage);
                    renderFilteredStudents(filtered);
                });
            });
        };

        const applyStudentFilter = () => {
            const query = document.getElementById("studentSearchInput")?.value.toLowerCase().trim() || "";

            const filtered = studentList.filter(s => matchStudentTableSearch(s, query));

            currentStudentPage = 1;
            renderFilteredStudents(filtered);
        };

        document.getElementById("studentSearchInput")?.addEventListener("input", applyStudentFilter);
        renderFilteredStudents(studentList);

    // 3. RESET KATA LALUAN PELAJAR
    } else if (panelName === "resetPassword") {
        if (pageTitleText) pageTitleText.textContent = "Reset Kata Laluan";

        const requests = await getStudentPasswordResetRequests();
        const rows = requests.length
            ? requests.map(req => `
                <tr>
                    <td><strong>${req.no_matriks || '-'}</strong></td>
                    <td>${req.nama || '-'}</td>
                    <td>${req.status || 'pending'}</td>
                    <td>${req.requestedAt ? new Date(req.requestedAt).toLocaleString('ms-MY') : '-'}</td>
                    <td>
                        ${req.status === 'pending' ? `<button type="button" class="btn btn-success approve-reset-btn" data-request-id="${req.id}"><i class="fas fa-check"></i> Approved</button>` : `<span class="badge">Approved</span>`}
                    </td>
                </tr>
            `).join('')
            : `<tr><td colspan="5">Tiada permintaan reset kata laluan pelajar.</td></tr>`;

        contentPanel.innerHTML = `
            <div class="card-box">
                <h3>Reset Kata Laluan Pelajar</h3>
                <p style="margin: 10px 0 18px; color: #6d5a88;">Senarai permintaan reset kata laluan pelajar untuk kelulusan warden.</p>
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>No. Matriks</th>
                            <th>Nama</th>
                            <th>Status</th>
                            <th>Tarikh</th>
                            <th>Tindakan</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        `;

        contentPanel.querySelectorAll('.approve-reset-btn')?.forEach(button => {
            button.addEventListener('click', async () => {
                const requestId = button.dataset.requestId;
                await approveStudentPasswordReset(requestId);
                loadPanelContent('resetPassword');
            });
        });

    // 4. DAFTAR KES BAHARU (TAJUK DIKEMAS KINI & LAMPIRAN GAMBAR)
    } else if (panelName === "daftarKesBaru" && targetMatriks) {
        if (pageTitleText) pageTitleText.textContent = "Daftar Kes Baharu";

        contentPanel.innerHTML = `
            <div class="card-box" style="margin-bottom: 25px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3>Daftar Kes Baharu</h3>
                    <button type="button" class="btn btn-secondary" id="backToDaftarKesBtn" style="padding: 8px 16px; font-size: 13px;"><i class="fas fa-arrow-left"></i> Kembali</button>
                </div>
                <form id="addReportForm" style="margin-top: 15px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                    <div>
                        <label style="font-weight:600;">No. Matriks Pelajar</label>
                        <input type="text" id="reportMatriksInput" class="form-control" placeholder="Cth: 18DDT21F1001" value="${targetMatriks || ''}" ${targetMatriks ? 'readonly' : ''} required>
                    </div>
                    <div>
                        <label style="font-weight:600;">Nama Pelajar</label>
                        <input type="text" id="reportNamaInput" class="form-control" readonly placeholder="Auto-fill">
                    </div>
                    <div>
                        <label style="font-weight:600;">Jabatan</label>
                        <input type="text" id="reportJabatanInput" class="form-control" readonly placeholder="Auto-fill">
                    </div>
                    <div>
                        <label style="font-weight:600;">Kategori Kes</label>
                        <div style="display: grid; gap: 8px;">
                            <select id="reportMainCategoryInput" class="form-control" required>
                                <option value="">Pilih Kategori Utama</option>
                                ${Object.keys(kategoriKesGroups).map(category => `<option value="${category}">${category}</option>`).join('')}
                            </select>
                            <select id="reportSubCategoryInput" class="form-control" required>
                                <option value="">Pilih Jenis Kesalahan</option>
                            </select>
                            <input type="hidden" id="reportKategoriInput" value="">
                        </div>
                    </div>
                    <div>
                        <label style="font-weight:600;">Status Amaran</label>
                        <select id="reportStatusInput" class="form-control" required>
                            <option value="Amaran Pertama">Amaran Pertama</option>
                            <option value="Amaran Kedua">Amaran Kedua</option>
                            <option value="Amaran Terakhir">Amaran Terakhir</option>
                        </select>
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label style="font-weight:600;">Lampirkan Gambar Bukti (Maksimum/Minima 20MB)</label>
                        <input type="file" id="reportImageInput" class="form-control" accept="image/*">
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label style="font-weight:600;">Keterangan Kes</label>
                        <textarea id="reportKeteranganInput" class="form-control" rows="3" required></textarea>
                    </div>
                    <div style="grid-column: 1 / -1; text-align: right;">
                        <button type="submit" class="btn btn-primary">Simpan Laporan</button>
                    </div>
                </form>
            </div>
        `;

        document.getElementById('backToDaftarKesBtn')?.addEventListener('click', () => {
            document.querySelectorAll('.nav-item[data-panel]').forEach(button => {
                button.classList.toggle('active', button.getAttribute('data-panel') === 'senaraiKes');
            });
            loadPanelContent('senaraiKes');
        });

        setupAddReportForm(targetMatriks);
        if (targetMatriks) {
            const presetInput = document.getElementById("reportMatriksInput");
            if (presetInput) {
                presetInput.value = targetMatriks.toUpperCase();
                presetInput.dispatchEvent(new Event('input'));
            }
        }

    // 5. LAPORAN / SENARAI KES DISIPLIN (DENGAN PENAPIS BULAN, KATEGORI, BLOK, JABATAN)
    } else if (panelName === "laporan") {
        const isReportList = true;
        if (pageTitleText) pageTitleText.textContent = "Laporan Kes Disiplin";
        await fetchStudentList();
        await fetchReportsData();

        // Ambil senarai unik kategori, blok, dan jabatan untuk dropdown filter
        const categories = [...new Set(reportsData.map(r => r.kategori_kes).filter(Boolean))];
        const depts = [...new Set(reportsData.map(r => r.jabatan).filter(Boolean))];
        const blocks = [...new Set(studentList.map(s => s.blok_asrama).filter(b => b && b !== '-'))];

        contentPanel.innerHTML = `
            <div class="card-box">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 15px;">
                    <h3>Laporan Kes Disiplin</h3>
                    <input type="text" id="reportSearchInput" class="form-control" style="max-width: 250px;" placeholder="Cari Matriks, Nama...">
                </div>

                <!-- BAR PENAPIS / FILTERS -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 20px; background: #eef5fa; padding: 15px; border-radius: 16px;">
                    <div>
                        <label style="font-size: 12px; font-weight: 600;">Filter Mengikut Bulan:</label>
                        <input type="month" id="filterMonth" class="form-control">
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600;">Filter Kategori Kes:</label>
                        <select id="filterCategory" class="form-control">
                            <option value="">Semua Kategori</option>
                            ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600;">Filter Blok Asrama:</label>
                        <select id="filterBlok" class="form-control">
                            <option value="">Semua Blok</option>
                            ${blocks.map(b => `<option value="${b}">${b}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600;">Filter Jabatan:</label>
                        <select id="filterDept" class="form-control">
                            <option value="">Semua Jabatan</option>
                            ${depts.map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="font-size: 12px; font-weight: 600;">Filter Badge Merit:</label>
                        <select id="filterMeritTier" class="form-control">
                            <option value="">Semua Badge</option>
                            <option value="model">Model Resident</option>
                            <option value="good">Good Standing</option>
                            <option value="warning">Warning Tier</option>
                            <option value="probation">Probation Tier</option>
                        </select>
                    </div>
                </div>

                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>Tarikh</th>
                                <th>No. Matriks</th>
                                <th>Nama Pelajar</th>
                                <th>Jabatan</th>
                                <th>Blok</th>
                                <th>Kategori Kes</th>
                                <th>Gambar</th>
                                <th>Status Amaran</th>
                                <th>Tindakan Laporan</th>
                            </tr>
                        </thead>
                        <tbody id="reportsTableBody">
                            ${renderReportsTableRows(reportsData, isReportList)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const applyFilters = () => {
            const searchQ = document.getElementById("reportSearchInput")?.value.toLowerCase().trim() || "";
            const monthVal = document.getElementById("filterMonth")?.value;
            const catVal = document.getElementById("filterCategory")?.value;
            const blokVal = document.getElementById("filterBlok")?.value;
            const deptVal = document.getElementById("filterDept")?.value;
            const meritTierVal = document.getElementById("filterMeritTier")?.value || "";

            const filtered = reportsData.filter(r => {
                const sInfo = studentList.find(s => s.no_matriks === r.no_matriks?.toUpperCase());
                const blok = r.blok_asrama || sInfo?.blok_asrama || "";
                const studentScore = Number(sInfo?.markah_disiplin ?? 100);
                const badge = getMeritBadgeTier(studentScore);

                const matchSearch = !searchQ || 
                    r.no_matriks?.toLowerCase().includes(searchQ) ||
                    (r.nama_pelajar || sInfo?.nama || '').toLowerCase().includes(searchQ) ||
                    r.kategori_kes?.toLowerCase().includes(searchQ);

                const matchMonth = !monthVal || (r.tarikh && r.tarikh.startsWith(monthVal));
                const matchCat = !catVal || r.kategori_kes === catVal;
                const matchBlok = !blokVal || blok === blokVal;
                const matchDept = !deptVal || r.jabatan === deptVal;
                const matchMerit = !meritTierVal || badge.key === meritTierVal;

                return matchSearch && matchMonth && matchCat && matchBlok && matchDept && matchMerit;
            });

            document.getElementById("reportsTableBody").innerHTML = renderReportsTableRows(filtered, isReportList);
        };

        document.getElementById("reportSearchInput")?.addEventListener("input", applyFilters);
        document.getElementById("filterMonth")?.addEventListener("change", applyFilters);
        document.getElementById("filterCategory")?.addEventListener("change", applyFilters);
        document.getElementById("filterBlok")?.addEventListener("change", applyFilters);
        document.getElementById("filterDept")?.addEventListener("change", applyFilters);
        document.getElementById("filterMeritTier")?.addEventListener("change", applyFilters);

    // 6. DASHBOARD PANEL (FORMERLY HEP ANALYTICS)
    } else if (panelName === "dashboard" || panelName === "daftarKesBaru") {
        if (pageTitleText) pageTitleText.textContent = panelName === "daftarKesBaru" ? "Daftar Kes Baharu" : "Dashboard Analitik";
        if (panelName === "daftarKesBaru") {
            // If no targetMatriks, show the case registration form without preset matrix
            contentPanel.innerHTML = `
                <div class="card-box" style="margin-bottom: 25px;">
                    <h3>Daftar Kes Baharu</h3>
                    <form id="addReportForm" style="margin-top: 15px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div>
                            <label style="font-weight:600;">No. Matriks Pelajar</label>
                            <input type="text" id="reportMatriksInput" class="form-control" placeholder="Cth: 18DDT21F1001" required>
                        </div>
                        <div>
                            <label style="font-weight:600;">Nama Pelajar</label>
                            <input type="text" id="reportNamaInput" class="form-control" readonly placeholder="Auto-fill">
                        </div>
                        <div>
                            <label style="font-weight:600;">Jabatan</label>
                            <input type="text" id="reportJabatanInput" class="form-control" readonly placeholder="Auto-fill">
                        </div>
                        <div>
                            <label style="font-weight:600;">Kategori Kes</label>
                            <div style="display: grid; gap: 8px;">
                                <select id="reportMainCategoryInput" class="form-control" required>
                                    <option value="">Pilih Kategori Utama</option>
                                    ${Object.keys(kategoriKesGroups).map(category => `<option value="${category}">${category}</option>`).join('')}
                                </select>
                                <select id="reportSubCategoryInput" class="form-control" required>
                                    <option value="">Pilih Jenis Kesalahan</option>
                                </select>
                                <input type="hidden" id="reportKategoriInput" value="">
                            </div>
                        </div>
                        <div>
                            <label style="font-weight:600;">Status Amaran</label>
                            <select id="reportStatusInput" class="form-control" required>
                                <option value="Amaran Pertama">Amaran Pertama</option>
                                <option value="Amaran Kedua">Amaran Kedua</option>
                                <option value="Amaran Terakhir">Amaran Terakhir</option>
                            </select>
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label style="font-weight:600;">Lampirkan Gambar Bukti (Maksimum/Minima 20MB)</label>
                            <input type="file" id="reportImageInput" class="form-control" accept="image/*">
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label style="font-weight:600;">Keterangan Kes</label>
                            <textarea id="reportKeteranganInput" class="form-control" rows="3" required></textarea>
                        </div>
                        <div style="grid-column: 1 / -1; text-align: right;">
                            <button type="submit" class="btn btn-primary">Simpan Laporan</button>
                        </div>
                    </form>
                </div>
            `;
            setupAddReportForm(null);
            return;
        }
        await fetchStudentList();
        await fetchReportsData();

        const deptCounts = reportsData.reduce((acc, r) => {
            if (r.jabatan) {
                acc[r.jabatan] = (acc[r.jabatan] || 0) + 1;
            }
            return acc;
        }, {});

        const categoryCounts = reportsData.reduce((acc, r) => {
            const category = r.kategori_kes || 'Tidak Diketahui';
            acc[category] = (acc[category] || 0) + 1;
            return acc;
        }, {});

        const deptKeys = Object.keys(deptCounts);
        const categoryKeys = Object.keys(categoryCounts);
        const topDept = deptKeys.length > 0 
            ? deptKeys.reduce((a, b) => deptCounts[a] > deptCounts[b] ? a : b) 
            : 'Tiada Kes';
        const topCategory = categoryKeys.length > 0
            ? categoryKeys.reduce((a, b) => categoryCounts[a] > categoryCounts[b] ? a : b)
            : 'Tiada Kes';

        const totalReports = reportsData.length;
        const totalProblematic = new Set(reportsData.map(r => r.no_matriks).filter(Boolean)).size;
        const meritCounts = {
            model: studentList.filter(s => getMeritBadgeTier(s.markah_disiplin ?? 100).key === 'model').length,
            good: studentList.filter(s => getMeritBadgeTier(s.markah_disiplin ?? 100).key === 'good').length,
            warning: studentList.filter(s => getMeritBadgeTier(s.markah_disiplin ?? 100).key === 'warning').length,
            probation: studentList.filter(s => getMeritBadgeTier(s.markah_disiplin ?? 100).key === 'probation').length
        };

        const maxMeritCount = Math.max(1, ...Object.values(meritCounts));
        const recentReports = [...reportsData].sort((a, b) => (b.tarikh || '').localeCompare(a.tarikh || '')).slice(0, 5);

        contentPanel.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-info">
                        <div class="number">${totalReports}</div>
                        <div class="label">Jumlah Kes</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-info">
                        <div class="number">${topCategory}</div>
                        <div class="label">Kategori Tertinggi</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-info">
                        <div class="number">${totalProblematic}</div>
                        <div class="label">Jumlah Pelajar Bermasalah</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-info">
                        <div class="number">${topDept}</div>
                        <div class="label">Jabatan Kes Tertinggi</div>
                    </div>
                </div>
            </div>

            <div class="card-box">
                <h3>Ringkasan Kes Mengikut Kategori</h3>
                <div class="table-wrapper" style="margin-top: 15px;">
                    <table>
                        <thead>
                            <tr>
                                <th>Kategori Kes</th>
                                <th>Jumlah</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${categoryKeys.length ? categoryKeys.map(category => {
                                const count = categoryCounts[category];
                                const maxCount = Math.max(...Object.values(categoryCounts), 1);
                                const width = (count / maxCount) * 100;
                                return `
                                    <tr>
                                        <td>${category}</td>
                                        <td>
                                            <div style="display:flex; align-items:center; gap:10px; min-width: 220px;">
                                                <span style="width: 34px; font-weight:700; color:#2f4f6f;">${count}</span>
                                                <div style="flex:1; height: 12px; background:#eaf1f6; border-radius:999px; overflow:hidden;">
                                                    <div style="height:100%; width:${width}%; background: linear-gradient(90deg, #4e9ad6, #6eb7ff); border-radius:999px;"></div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('') : '<tr><td colspan="2" style="text-align:center;">Tiada data kes.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card-box">
                <h3>Ringkasan Kes Mengikut Jabatan</h3>
                <div class="table-wrapper" style="margin-top: 15px;">
                    <table>
                        <thead>
                            <tr>
                                <th>Jabatan</th>
                                <th>Jumlah Kes Disiplin</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${deptKeys.length ? deptKeys.map(d => `
                                <tr>
                                    <td>${d}</td>
                                    <td>${deptCounts[d]}</td>
                                </tr>
                            `).join('') : '<tr><td colspan="2" style="text-align:center;">Tiada data kes.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card-box">
                <h3>Kesalahan Terkini</h3>
                <div class="table-wrapper" style="margin-top: 15px;">
                    <table>
                        <thead>
                            <tr>
                                <th>Tarikh</th>
                                <th>Nama</th>
                                <th>Kategori Kes</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recentReports.length ? recentReports.map(report => `
                                <tr>
                                    <td>${report.tarikh || '-'}</td>
                                    <td>${report.nama_pelajar || '-'}</td>
                                    <td>${report.kategori_kes || '-'}</td>
                                    <td><span class="status-badge ${getStatusBadgeClass(report.status_amaran)}">${report.status_amaran || 'Amaran Pertama'}</span></td>
                                </tr>
                            `).join('') : '<tr><td colspan="4" style="text-align:center;">Tiada data terkini.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card-box">
                <h3>Trend Badge Merit</h3>
                <div class="merit-chart" style="margin-top: 15px;">
                    ${Object.entries({
                        'Model Resident': meritCounts.model,
                        'Good Standing': meritCounts.good,
                        'Warning Tier': meritCounts.warning,
                        'Probation Tier': meritCounts.probation
                    }).map(([label, count]) => `
                        <div class="merit-chart-row">
                            <div class="merit-chart-label">${label}</div>
                            <div class="merit-chart-bar-wrap">
                                <div class="merit-chart-bar ${label === 'Model Resident' ? 'model' : label === 'Good Standing' ? 'good' : label === 'Warning Tier' ? 'warning' : 'probation'}" style="width: ${(count / maxMeritCount) * 100}%"></div>
                            </div>
                            <div class="merit-chart-count">${count}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }
}

// ==========================================
// 5. AUTO-FILL FORM & IMAGE UPLOAD HANDLING
// ==========================================
function showReportPopup(title, message, type = 'success') {
    document.getElementById('reportStatusModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'reportStatusModal';
    modal.className = 'report-status-modal';
    modal.innerHTML = `
        <div class="report-status-card ${type}">
            <div class="report-status-icon">${type === 'success' ? '✓' : '!'}</div>
            <h3>${title}</h3>
            <p>${message}</p>
            <button type="button" class="btn btn-primary report-status-close">Tutup</button>
        </div>
    `;

    document.body.appendChild(modal);
    const closeModal = () => modal.remove();
    modal.querySelector('.report-status-close')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
}

function setupAddReportForm(presetMatriks = null) {
    const matriksInput = document.getElementById("reportMatriksInput");
    const form = document.getElementById("addReportForm");
    const mainCategoryInput = document.getElementById("reportMainCategoryInput");
    const subCategoryInput = document.getElementById("reportSubCategoryInput");
    const hiddenCategoryInput = document.getElementById("reportKategoriInput");

    if (!form) return;

    const updateSubCategoryOptions = () => {
        if (!mainCategoryInput || !subCategoryInput || !hiddenCategoryInput) return;

        const selectedMain = mainCategoryInput.value;
        const options = selectedMain ? kategoriKesGroups[selectedMain] || [] : [];

        subCategoryInput.innerHTML = options.length
            ? `<option value="">Pilih Jenis Kesalahan</option>${options.map(option => `<option value="${option}">${option}</option>`).join('')}`
            : `<option value="">Pilih Jenis Kesalahan</option>`;

        hiddenCategoryInput.value = subCategoryInput.value || "";
    };

    mainCategoryInput?.addEventListener("change", () => {
        updateSubCategoryOptions();
    });

    subCategoryInput?.addEventListener("change", () => {
        if (hiddenCategoryInput) hiddenCategoryInput.value = subCategoryInput.value || "";
    });

    updateSubCategoryOptions();

    matriksInput?.addEventListener("input", async (e) => {
        const query = e.target.value.trim().toUpperCase();

        const namaEl = document.getElementById("reportNamaInput");
        const jabatanEl = document.getElementById("reportJabatanInput");

        if (!query) {
            if (namaEl) namaEl.value = "";
            if (jabatanEl) jabatanEl.value = "";
            return;
        }

        const student = await getStudentByMatrixID(query);

        if (student) {
            if (matriksInput) matriksInput.value = student.no_matriks || query;
            if (namaEl) namaEl.value = student.nama;
            if (jabatanEl) jabatanEl.value = student.jabatan;
        } else {
            if (namaEl) namaEl.value = "";
            if (jabatanEl) jabatanEl.value = "";
        }
    });

    if (presetMatriks) {
        const namaEl = document.getElementById("reportNamaInput");
        const jabatanEl = document.getElementById("reportJabatanInput");

        const fillStudentInfo = async () => {
            const cleanedMatrix = String(presetMatriks).trim().toUpperCase();
            if (matriksInput) matriksInput.value = cleanedMatrix;

            const student = await getStudentByMatrixID(cleanedMatrix);
            if (student) {
                if (matriksInput) matriksInput.value = student.no_matriks || cleanedMatrix;
                if (namaEl) namaEl.value = student.nama;
                if (jabatanEl) jabatanEl.value = student.jabatan;
            }
        };
        fillStudentInfo();
    }

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const matriksVal = matriksInput.value.trim().toUpperCase();
        const namaVal = document.getElementById("reportNamaInput")?.value;
        const jabatanVal = document.getElementById("reportJabatanInput")?.value;
        const fileInput = document.getElementById("reportImageInput");

        if (!namaVal || !jabatanVal) {
            showReportPopup("Pelajar Tidak Dijumpai", "Sila pastikan No. Matriks adalah betul.", 'error');
            return;
        }

        let imageUrl = "";
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const maxMB = 20;
            if (file.size > maxMB * 1024 * 1024) {
                showReportPopup("Saiz Imej Terlalu Besar", `Sila pilih imej yang lebih kecil daripada ${maxMB}MB.`, 'error');
                return;
            }

            // Converter gambar ke Base64 Data URL
            imageUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(file);
            });
        }

        try {
            await addDoc(collection(db, "laporan"), {
                no_matriks: matriksVal,
                nama_pelajar: namaVal,
                jabatan: jabatanVal,
                kategori_kes: document.getElementById("reportKategoriInput").value.trim(),
                keterangan: document.getElementById("reportKeteranganInput").value.trim(),
                status_amaran: document.getElementById("reportStatusInput").value,
                gambar_url: imageUrl,
                tarikh: new Date().toISOString().split('T')[0],
                warden_id: auth.currentUser ? auth.currentUser.uid : "unknown"
            });

            allReportsData = null;
            studentReportsCache.clear();
            dataLoaded.reports = false;
            await fetchReportsData();
            const nextScore = calculateStudentMeritScore(matriksVal);
            const studentDocRef = doc(db, "students", matriksVal);
            try {
                await updateDoc(studentDocRef, { markah_disiplin: nextScore });
            } catch (updateErr) {
                console.warn("Update student score failed:", updateErr);
            }

            const matchingStudent = studentList.find(s => s.no_matriks === matriksVal);
            if (matchingStudent) {
                matchingStudent.markah_disiplin = nextScore;
            }

            if (currentUserData?.no_matriks === matriksVal) {
                currentUserData.markah_disiplin = nextScore;
            }

            showReportPopup("Laporan Berjaya Disimpan", "Laporan kes telah berjaya disimpan.");
            await fetchReportsData();
            syncStudentMeritScores();
            loadPanelContent("senaraiKes");
        } catch (err) {
            console.error("Ralat menyimpan laporan:", err);
            showReportPopup("Gagal Menyimpan Laporan", "Sila cuba lagi.", 'error');
        }
    });
}

function matchStudentTableSearch(student, query, includeScoreAndBadge = false) {
    if (!query) return true;

    const badge = getMeritBadgeTier(Number(student?.markah_disiplin ?? 100));
    const searchableFields = [
        student?.no_matriks,
        student?.nama,
        student?.jabatan,
        student?.blok_asrama
    ];

    if (includeScoreAndBadge) {
        searchableFields.push(String(student?.markah_disiplin ?? 100));
        searchableFields.push(badge.label);
        searchableFields.push(badge.key);
        searchableFields.push(badge.icon);
    }

    return searchableFields.some(value => String(value ?? '').toLowerCase().includes(query));
}

// Renderers Jadual
function renderStudentTableRows(list, visibleCount = list.length, includeReportAction = false) {
    const columnCount = includeReportAction ? 5 : 6;
    if (!list.length) return `<tr><td colspan="${columnCount}" style="text-align:center;">Tiada rekod pelajar dijumpai.</td></tr>`;
    return list.slice(0, visibleCount).map(s => {
        const score = Number(s.markah_disiplin ?? 100);
        const badge = getMeritBadgeTier(score);
        return `
            <tr>
                <td><strong>${s.no_matriks}</strong></td>
                <td>${s.nama}</td>
                <td>${s.jabatan}</td>
                <td>${s.blok_asrama}</td>
                ${includeReportAction ? `<td><button class="btn btn-primary" style="padding: 6px 16px; font-size: 13px;" onclick="window.bukaDaftarKesPelajar('${s.no_matriks}')"><i class="fas fa-plus"></i> Laporan</button></td>` : `<td>${score}</td><td><span class="merit-mini-badge ${badge.className}">${badge.icon} ${badge.label}</span></td>`}
            </tr>
        `;
    }).join('');
}

function renderReportsTableRows(list, includeReportAction = false) {
    if (!list.length) return `<tr><td colspan="${includeReportAction ? 9 : 8}" style="text-align:center;">Tiada laporan disimpan.</td></tr>`;
    return list.map(r => {
        const sInfo = studentList.find(s => s.no_matriks === r.no_matriks?.toUpperCase());
        const blok = r.blok_asrama || sInfo?.blok_asrama || "-";
        const studentName = r.nama_pelajar || sInfo?.nama || '-';
        return `
            <tr>
                <td>${r.tarikh || '-'}</td>
                <td><strong>${r.no_matriks || '-'}</strong></td>
                <td>${studentName}</td>
                <td>${r.jabatan || '-'}</td>
                <td>${blok}</td>
                <td>${r.kategori_kes || '-'}</td>
                <td>${r.gambar_url ? `<a href="${r.gambar_url}" target="_blank"><img src="${r.gambar_url}" style="width:40px; height:40px; object-fit:cover; border-radius:6px;"></a>` : 'Tiada'}</td>
                <td><span class="status-badge ${getStatusBadgeClass(r.status_amaran)}">${r.status_amaran || 'Amaran Pertama'}</span></td>
                ${includeReportAction ? `<td><button class="btn btn-primary" style="padding: 6px 16px; font-size: 13px;" onclick="window.bukaDaftarKesPelajar('${r.no_matriks || ''}')"><i class="fas fa-plus"></i> Laporan</button></td>` : ''}
            </tr>
        `;
    }).join('');
}
