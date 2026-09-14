import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword, 
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword,
    sendPasswordResetEmail,
    signOut
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
import { renderSidebarNavigation } from "./sidebar.js";
import "./navigation.js";
import { kategoriKesGroups, setupAddReportForm } from "./reportForm.js";
import { createDataFetchingService } from "./data-fetching.js";
import { createReportUiService } from "./report-ui.js";
import { createPanelRouter } from "./panel-router.js";
import { createAuthenticationService, setupAuthenticationHandlers } from "./authentication.js";

// Firebase credentials
const firebaseConfig = {
    apiKey: "AIzaSyAd99msyNGPIdBX9PgK35sPstPWI9KZ6O4",
    authDomain: "system-fyp.firebaseapp.com",
    projectId: "system-fyp",
    messagingSenderId: "827409920747",
    appId: "1:827409920747:web:c77597d81d83d288ddc4ae"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
window.firebaseAuth = auth;

// Global Variables
let currentRole = 'pelajar';
let currentUserData = null;
let studentList = [];
let reportsData = [];
let allReportsData = null;
const studentReportsCache = new Map();
let isSigningUp = false;
let loginMode = 'student';
const STUDENT_BASE_PASSWORD = '123456';
const STUDENT_PASSWORD_RESET_REQUESTS_COLLECTION = 'password_reset_requests';
let dataLoaded = {
    students: false,
    reports: false
};

const dataState = {};
Object.defineProperties(dataState, {
    studentList: { get: () => studentList, set: value => { studentList = value; } },
    reportsData: { get: () => reportsData, set: value => { reportsData = value; } },
    allReportsData: { get: () => allReportsData, set: value => { allReportsData = value; } },
    studentReportsCache: { get: () => studentReportsCache },
    dataLoaded: { get: () => dataLoaded }
});

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

function createStudentAccount(matrix, password) {
    const internalStudentEmail = `${normalizeMatrix(matrix).toLowerCase()}@tadib.com`;
    return createUserWithEmailAndPassword(auth, internalStudentEmail, password);
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

const {
    fetchStudentList,
    fetchReportsData,
    getStudentByMatrixID
} = createDataFetchingService({
    db,
    state: dataState,
    getJabatanFromMatrix,
    syncStudentMeritScores
});

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
        'block', 'blok', 'status_amaran', 'createdAt', 'updatedAt'
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

function renderOtherMeritTiers() {
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
                ${renderOtherMeritTiers()}
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

const {
    showReportPopup,
    matchStudentTableSearch,
    renderStudentTableRows,
    renderReportsTableRows,
    bindReportImagePreviews
} = createReportUiService({
    getMeritBadgeTier,
    getStatusBadgeClass,
    getStudentList: () => studentList
});

// Helper perantara untuk terus buka borang kes bagi pelajar tertentu
window.bukaDaftarKesPelajar = function(matriks) {
    loadPanelContent('daftarKesBaru', matriks);
};

// ==========================================
const loadPanelContent = createPanelRouter({
    auth, db,
    get currentUserData() { return currentUserData; },
    get studentList() { return studentList; },
    get reportsData() { return reportsData; },
    get allReportsData() { return allReportsData; },
    get studentReportsCache() { return studentReportsCache; },
    dataLoaded,
    createUserWithEmailAndPassword, setDoc, addDoc, collection, updateDoc, doc, showReportPopup,
    getStudentByMatrixID, syncStudentMeritScores,
    fetchReportsData, fetchStudentList, getStudentPasswordResetRequests,
    approveStudentPasswordReset, getJabatanFromMatrix, getStatusBadgeClass,
    calculateStudentMeritScore, getMeritBadgeTier, getMeritLedgerEntries,
    renderStudentProfileFields, renderMeritBadge, showBadgeDetails,
    renderStudentTableRows, matchStudentTableSearch, renderReportsTableRows,
    bindReportImagePreviews,
    kategoriKesGroups, setupAddReportForm
});

const { showDashboard } = createAuthenticationService({
    auth,
    db,
    state: {
        get currentUserData() { return currentUserData; },
        set currentUserData(value) { currentUserData = value; },
        get currentRole() { return currentRole; },
        set currentRole(value) { currentRole = value; },
        get isSigningUp() { return isSigningUp; },
        set isSigningUp(value) { isSigningUp = value; },
        get loginMode() { return loginMode; },
        set loginMode(value) { loginMode = value; }
    },
    getDoc,
    doc,
    getStudentByMatrixID,
    getJabatanFromMatrix,
    normalizeRole,
    showScreen,
    renderSidebarNavigation,
    loadPanelContent,
    signOut
});

setupAuthenticationHandlers({
    state: {
        get currentUserData() { return currentUserData; },
        set currentUserData(value) { currentUserData = value; },
        get currentRole() { return currentRole; },
        set currentRole(value) { currentRole = value; },
        get isSigningUp() { return isSigningUp; },
        set isSigningUp(value) { isSigningUp = value; },
        get loginMode() { return loginMode; },
        set loginMode(value) { loginMode = value; }
    },
    auth, loginForm, usernameInput, passwordInput, loginError, errorText,
    signInWithMatrixOrEmail, staffLoginForm, staffLoginError, staffErrorText,
    signInWithEmailAndPassword, showAuthError, sendPasswordResetEmail,
    resetPasswordForm, resetPasswordIdentityInput, resetPasswordError,
    resetPasswordSuccess, resetPasswordSuccessText, resetPasswordErrorText,
    createStudentPasswordRequest, getStudentByMatrixID, normalizeMatrix,
    signupForm, signupError, signupErrorText, signupMatrixInput,
    signupPasswordInput, signupConfirmPasswordInput, STUDENT_BASE_PASSWORD,
    createStudentAccount, setDoc, doc, saveStudentPassword, signOut,
    changePasswordForm, changePasswordError, changePasswordErrorText,
    currentPasswordInput: document.getElementById('currentPassword'),
    newPasswordInput, confirmNewPasswordInput,
    reauthenticateWithCredential,
    EmailAuthProvider,
    updatePassword, updateDoc, getDoc, db, showDashboard,
    showScreen
});
