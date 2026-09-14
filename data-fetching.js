import {
    collection,
    getDoc,
    getDocs,
    doc,
    limit,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export function createDataFetchingService({ db, state, getJabatanFromMatrix, syncStudentMeritScores }) {
    function normalizeMatrix(matrix) {
        return (matrix || '').toString().trim().replace(/\s+/g, '').toUpperCase();
    }

    async function fetchStudentList() {
        if (state.dataLoaded.students) return;
        try {
            const querySnapshot = await getDocs(collection(db, "students"));
            state.studentList = querySnapshot.docs.map(docSnap => {
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
            state.studentList.sort((firstStudent, secondStudent) => firstStudent.no_matriks.localeCompare(secondStudent.no_matriks));
            state.dataLoaded.students = true;
            syncStudentMeritScores();
        } catch (err) {
            console.error("Ralat mengambil senarai pelajar:", err);
        }
    }

    async function fetchReportsData(filterMatrix = null, pageSize = 200) {
        const normalizedMatrix = normalizeMatrix(filterMatrix) || null;
        if (normalizedMatrix && state.studentReportsCache.has(normalizedMatrix)) {
            const cachedReports = state.studentReportsCache.get(normalizedMatrix);
            if (cachedReports.length) {
                state.reportsData = cachedReports;
                return;
            }
            state.studentReportsCache.delete(normalizedMatrix);
        }
        if (!normalizedMatrix && state.allReportsData?.length) {
            state.reportsData = state.allReportsData;
            state.dataLoaded.reports = true;
            return;
        }

        try {
            let querySnapshot;
            if (normalizedMatrix) {
                const reportsQuery = query(collection(db, "laporan"), where("no_matriks", "==", normalizedMatrix), limit(pageSize));
                querySnapshot = await getDocs(reportsQuery);
                if (querySnapshot.empty) {
                    const allReportsQuery = query(collection(db, "laporan"), limit(pageSize));
                    const allReportsSnapshot = await getDocs(allReportsQuery);
                    querySnapshot = allReportsSnapshot;
                }
            } else {
                querySnapshot = await getDocs(query(collection(db, "laporan"), limit(pageSize)));
            }
            state.reportsData = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            }));

            state.reportsData.sort((firstReport, secondReport) => new Date(secondReport.tarikh || 0) - new Date(firstReport.tarikh || 0));
            if (normalizedMatrix) {
                state.studentReportsCache.set(normalizedMatrix, state.reportsData);
            } else {
                state.allReportsData = state.reportsData;
                state.dataLoaded.reports = true;
            }
        } catch (err) {
            console.error("Ralat mengambil senarai laporan:", err);
            throw err;
        }
    }

    async function getStudentByMatrixID(matriksId) {
        if (!matriksId) return null;
        const cleanId = matriksId.trim().toUpperCase();

        const local = state.studentList.find(student => student.no_matriks === cleanId);
        if (local) return local;

        try {
            const studentDoc = await getDoc(doc(db, "students", cleanId));
            if (studentDoc.exists()) {
                return normalizeStudent(studentDoc.data(), studentDoc.id);
            }

            const studentQuery = query(collection(db, "students"), where("matrix_no", "==", cleanId), limit(1));
            const studentMatches = await getDocs(studentQuery);
            if (!studentMatches.empty) {
                const matchingDoc = studentMatches.docs[0];
                return normalizeStudent(matchingDoc.data(), matchingDoc.id, cleanId);
            }
        } catch (err) {
            console.error("Firestore student lookup error:", err);
        }
        return null;
    }

    function normalizeStudent(data, id, fallbackMatrix = id) {
        return {
            ...data,
            id,
            no_matriks: (data.matrix_no || data.no_matriks || fallbackMatrix).toString().toUpperCase(),
            nama: data.name || data.nama || data.nama_pelajar || "",
            jabatan: getJabatanFromMatrix(data.matrix_no || data.no_matriks || fallbackMatrix, data.jabatan || "N/A"),
            blok_asrama: data.blok_asrama || data.block || "-",
            room_no: data.room_no || "-",
            bed_no: data.bed_no ?? "-",
            semester: data.semester || "-",
            status_amaran: data.status_amaran || "Tiada Amaran",
            markah_disiplin: data.markah_disiplin ?? 100
        };
    }

    return {
        fetchStudentList,
        fetchReportsData,
        getStudentByMatrixID
    };
}
