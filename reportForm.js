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
                showReportPopup("Saiz Imej Terlalu Besar", `Sila pilih imej yang lebih kecil daripada ${maxMB}MB.`, 'error');
                return;
            }

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
