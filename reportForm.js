export const kategoriKesGroups = {
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
        "Berniaga Tanpa Kebenangan",
        "Tukar Bilik Sendiri"
    ]
};

async function compressImageForFirestore(file) {
    const maxBytes = 700 * 1024;
    const objectUrl = URL.createObjectURL(file);

    try {
        const image = await new Promise((resolve, reject) => {
            const imageElement = new Image();
            imageElement.onload = () => resolve(imageElement);
            imageElement.onerror = reject;
            imageElement.src = objectUrl;
        });
        const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        for (let quality = 0.8; quality >= 0.3; quality -= 0.1) {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrl.length * 0.75 <= maxBytes) return dataUrl;
        }
        throw new Error('Compressed image is still too large.');
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

export function setupAddReportForm(presetMatriks = null, deps = {}) {
    const {
        getStudentByMatrixID,
        showReportPopup,
        addDoc,
        collection,
        db,
        auth,
        updateDoc,
        doc,
        fetchReportsData,
        calculateStudentMeritScore,
        syncStudentMeritScores,
        loadPanelContent,
        studentList,
        allReportsData,
        studentReportsCache,
        dataLoaded,
        currentUserData,
    } = deps;

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
                showReportPopup("Saiz Imej Terlalu Besar", "Sila pilih imej yang lebih kecil daripada 20MB.", 'error');
                return;
            }

            try {
                imageUrl = await compressImageForFirestore(file);
            } catch (imageError) {
                console.error("Ralat memproses gambar laporan:", imageError);
                showReportPopup("Gagal Memproses Gambar", "Sila pilih gambar yang lebih kecil dan cuba lagi.", 'error');
                return;
            }
        }

        try {
            await addDoc(collection(db, "laporan"), {
                no_matriks: matriksVal,
                nama_pelajar: namaVal,
                jabatan: jabatanVal,
                kategori_kes: document.getElementById("reportKategoriInput").value.trim(),
                keterangan: document.getElementById("reportKeteranganInput").value.trim(),
                status_amaran: document.getElementById("reportStatusInput").value,
                tindakan_amaran: document.getElementById("reportTindakanAmaranInput")?.checked === true,
                gambar_url: imageUrl,
                tarikh: new Date().toISOString().split('T')[0],
                warden_id: auth.currentUser ? auth.currentUser.uid : "unknown"
            });

            try {
                showReportPopup("Laporan Berjaya Disimpan", "Laporan kes telah berjaya disimpan.");
                allReportsData = null;
                studentReportsCache.clear();
                dataLoaded.reports = false;
                await fetchReportsData();
                const nextScore = calculateStudentMeritScore(matriksVal);
                const studentDocRef = doc(db, "students", matriksVal);
                try {
                    await updateDoc(studentDocRef, { merit_disiplin: nextScore });
                } catch (updateErr) {
                    console.warn("Update student score failed:", updateErr);
                }

                const matchingStudent = studentList.find(s => s.no_matriks === matriksVal);
                if (matchingStudent) {
                    matchingStudent.merit_disiplin = nextScore;
                }

                if (currentUserData?.no_matriks === matriksVal) {
                    currentUserData.merit_disiplin = nextScore;
                }
                syncStudentMeritScores();
                loadPanelContent("senaraiKes");
            } catch (refreshErr) {
                console.warn("Laporan disimpan tetapi paparan gagal dikemas kini:", refreshErr);
            }
        } catch (err) {
            console.error("Ralat menyimpan laporan:", err);
            const errorCode = err?.code || '';
            const message = errorCode === 'permission-denied'
                ? "Akses pangkalan data ditolak. Sila log masuk semula atau semak peraturan Firebase."
                : errorCode === 'unauthenticated'
                    ? "Sesi log masuk telah tamat. Sila log masuk semula."
                : errorCode === 'resource-exhausted' || errorCode === 'invalid-argument'
                    ? "Data laporan terlalu besar. Sila gunakan gambar yang lebih kecil."
                    : `Sila cuba lagi${errorCode ? ` (${errorCode})` : ''}.`;
            showReportPopup("Gagal Menyimpan Laporan", message, 'error');
        }
    });    
}

export function setupStudentComplaintForm(deps = {}) {
    const {
        getStudentByMatrixID,
        showReportPopup,
        addDoc,
        collection,
        db,
        auth,
        currentUserData
    } = deps;

    const form = document.getElementById("studentComplaintForm");

    if (!form) return;

    const matrixInput = document.getElementById("complaintTargetMatrix");
    const nameInput = document.getElementById("complaintTargetName");
    const departmentInput = document.getElementById("complaintTargetDepartment");

    matrixInput?.addEventListener("input", async (e) => {
        const matrix = e.target.value.trim().toUpperCase();

        if (!matrix) {
            if (nameInput) nameInput.value = "";
            if (departmentInput) departmentInput.value = "";
            return;
        }

        const student = await getStudentByMatrixID(matrix);

        if (student) {
            if (nameInput) nameInput.value = student.nama || "";
            if (departmentInput) departmentInput.value = student.jabatan || "";
        } else {
            if (nameInput) nameInput.value = "";
            if (departmentInput) departmentInput.value = "";
        }
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const targetMatrix = matrixInput?.value.trim().toUpperCase() || "";
        const targetName = nameInput?.value.trim() || "";
        const targetDepartment = departmentInput?.value.trim() || "";

        const category =
            document.getElementById("complaintCategory")?.value.trim() || "";

        const description =
            document.getElementById("complaintDescription")?.value.trim() || "";

        const imageInput = document.getElementById("complaintImage");

        // Pastikan pelajar yang dilaporkan wujud
        if (!targetName || !targetDepartment) {
            showReportPopup(
                "Pelajar Tidak Dijumpai",
                "Sila masukkan No. Matriks pelajar yang sah.",
                "error"
            );
            return;
        }

        // Pelajar tidak boleh melaporkan diri sendiri
        const reporterMatrix =
            (currentUserData?.no_matriks || "").toString().trim().toUpperCase();

        if (reporterMatrix && targetMatrix === reporterMatrix) {
            showReportPopup(
                "Laporan Tidak Sah",
                "Anda tidak boleh membuat laporan terhadap diri sendiri.",
                "error"
            );
            return;
        }

        if (!category || !description) {
            showReportPopup(
                "Maklumat Tidak Lengkap",
                "Sila lengkapkan kategori dan keterangan laporan.",
                "error"
            );
            return;
        }

        let imageUrl = "";

        // Proses gambar bukti jika ada
        if (imageInput && imageInput.files.length > 0) {
            const file = imageInput.files[0];

            if (!file.type.startsWith("image/")) {
                showReportPopup(
                    "Fail Tidak Sah",
                    "Sila pilih fail gambar sahaja.",
                    "error"
                );
                return;
            }

            const maxMB = 20;

            if (file.size > maxMB * 1024 * 1024) {
                showReportPopup(
                    "Saiz Imej Terlalu Besar",
                    "Sila pilih gambar yang lebih kecil daripada 20MB.",
                    "error"
                );
                return;
            }

            try {
                imageUrl = await compressImageForFirestore(file);
            } catch (imageError) {
                console.error(
                    "Ralat memproses gambar aduan:",
                    imageError
                );

                showReportPopup(
                    "Gagal Memproses Gambar",
                    "Sila pilih gambar yang lebih kecil dan cuba lagi.",
                    "error"
                );
                return;
            }
        }

        try {
            await addDoc(collection(db, "laporan"), {

                // Pelajar yang dilaporkan
                no_matriks: targetMatrix,
                nama_pelajar: targetName,
                jabatan: targetDepartment,

                // Maklumat laporan
                kategori_kes: category,
                keterangan: description,
                gambar_url: imageUrl,

                // Maklumat pelapor
                pelapor_matriks:
                    currentUserData?.no_matriks || "",
                pelapor_nama:
                    currentUserData?.nama ||
                    currentUserData?.name ||
                    "",
                pelapor_uid:
                    auth.currentUser?.uid || "",

                // Status laporan
                status: "Menunggu Semakan",

                // Tarikh
                tarikh:
                    new Date().toISOString().split("T")[0],

                // Masa
                timestamp:
                    new Date().toISOString()
            });

            showReportPopup(
                "Laporan Berjaya Dihantar",
                "Laporan anda telah dihantar kepada pihak warden untuk semakan.",
                "success"
            );

            form.reset();

            if (nameInput) nameInput.value = "";
            if (departmentInput) departmentInput.value = "";

        } catch (err) {
            console.error(
                "Ralat menyimpan aduan pelajar:",
                err
            );

            const errorCode = err?.code || "";

            const message =
                errorCode === "permission-denied"
                    ? "Akses pangkalan data ditolak. Sila semak Firebase Security Rules."
                    : "Laporan gagal dihantar. Sila cuba lagi.";

            showReportPopup(
                "Gagal Menghantar Laporan",
                message,
                "error"
            );
        }
    });
}
