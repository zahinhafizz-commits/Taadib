export function createPanelRouter(deps) {
    return async function loadPanelContent(panelName, targetMatriks = null) {
        const {
            auth, db, currentUserData, studentList, reportsData,
            allReportsData, studentReportsCache, dataLoaded,
            createUserWithEmailAndPassword, setDoc, addDoc, collection, updateDoc, doc, showReportPopup,
            getStudentByMatrixID, syncStudentMeritScores,
            fetchReportsData, fetchStudentList, getStudentPasswordResetRequests,
            approveStudentPasswordReset, getJabatanFromMatrix, getStatusBadgeClass,
            calculateStudentMeritScore, getMeritBadgeTier, getMeritLedgerEntries,
            renderStudentProfileFields, renderMeritBadge, showBadgeDetails,
            renderStudentTableRows, matchStudentTableSearch, renderReportsTableRows,
            bindReportImagePreviews,
            kategoriKesGroups, setupAddReportForm
        } = deps;

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
                <p style="margin: 10px 0 18px; color: #6d5a88;">Cipta akaun baru untuk roll call admin. Kata laluan akan ditetapkan kepada <strong>123456</strong>.</p>
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
                        <input type="text" id="adminPasswordInput" class="form-control" value="123456" readonly>
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
            const password = '123456';

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
                    passwordChanged: false,
                    staffPasswordSetup: false,
                    createdBy: currentUserData?.nama || 'Admin'
                });

                document.getElementById('createRollCallAdminForm')?.reset();
                document.getElementById('adminPasswordInput').value = '123456';
                showReportPopup('Akaun Berjaya Dicipta', `Akaun roll call admin ${adminName} telah berjaya ditambah. Kata laluan: 123456`, 'success');
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

        if (!currentUserData) {
            contentPanel.innerHTML = '<div class="card-box"><h3>Profil pelajar belum tersedia</h3><p>Sila muat semula halaman dan cuba lagi.</p></div>';
            return;
        }

        const userMatriks = currentUserData?.no_matriks || "";
        await fetchReportsData(userMatriks);
        const normalizedUserMatrix = userMatriks.replace(/\s+/g, '').toUpperCase();
        const normalizedUserName = (currentUserData?.nama || currentUserData?.name || '').trim().toUpperCase();
        const myReports = reportsData.filter(report => {
            const reportMatrix = (report.no_matriks || report.matrix_no || '').toString().replace(/\s+/g, '').toUpperCase();
            const reportName = (report.nama_pelajar || report.nama || report.name || '').toString().trim().toUpperCase();
            return reportMatrix === normalizedUserMatrix || (normalizedUserName && reportName === normalizedUserName);
        });
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
                                    <td>${r.gambar_url ? `<a href="${r.gambar_url}" class="report-image-preview-link" data-report-image="${r.gambar_url}" title="Lihat gambar penuh"><img src="${r.gambar_url}" alt="Bukti laporan" style="width:45px; height:45px; object-fit:cover; border-radius:8px; cursor:zoom-in;"></a>` : 'Tiada'}</td>
                                    <td><span class="status-badge ${getStatusBadgeClass(r.status_amaran)}">${r.status_amaran || 'Amaran Pertama'}</span></td>
                                </tr>
                            `).join('') : `<tr><td colspan="5" style="text-align:center;">Tiada rekod kesalahan untuk matriks ${userMatriks || 'tidak diketahui'}.</td></tr>`}
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

        bindReportImagePreviews(contentPanel);
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
                    <div style="grid-column: 1 / -1;">
                        <label style="font-weight:600;">Kategori Kes</label>
                        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
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
                    <div style="grid-column: 1 / -1;">
                        <label style="font-weight:600;">Lampirkan Gambar Bukti (Maksimum 20MB)</label>
                        <input type="file" id="reportImageInput" class="form-control" accept="image/*">
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <label style="font-weight:600;">Keterangan Kes</label>
                        <textarea id="reportKeteranganInput" class="form-control" rows="3" required></textarea>
                    </div>
                    <div style="grid-column: 1 / -1; display: grid; grid-template-columns: minmax(200px, 1fr) auto; gap: 15px; align-items: end;">
                        <div>
                            <label style="font-weight:600;">Status Amaran</label>
                            <select id="reportStatusInput" class="form-control" required>
                                <option value="Amaran Pertama">Amaran Pertama</option>
                                <option value="Amaran Kedua">Amaran Kedua</option>
                                <option value="Amaran Terakhir">Amaran Terakhir</option>
                            </select>
                        </div>
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

        setupAddReportForm(targetMatriks, {
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
            currentUserData
        });
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

        bindReportImagePreviews(document.getElementById("reportsTableBody"));

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
            bindReportImagePreviews(document.getElementById("reportsTableBody"));
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
                        <div style="grid-column: 1 / -1;">
                            <label style="font-weight:600;">Kategori Kes</label>
                            <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;">
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
                        <div style="grid-column: 1 / -1;">
                            <label style="font-weight:600;">Lampirkan Gambar Bukti (Maksimum 20MB)</label>
                            <input type="file" id="reportImageInput" class="form-control" accept="image/*">
                        </div>
                        <div style="grid-column: 1 / -1;">
                            <label style="font-weight:600;">Keterangan Kes</label>
                            <textarea id="reportKeteranganInput" class="form-control" rows="3" required></textarea>
                        </div>
                        <div style="grid-column: 1 / -1; display: grid; grid-template-columns: minmax(200px, 1fr) auto; gap: 15px; align-items: end;">
                            <div>
                                <label style="font-weight:600;">Status Amaran</label>
                                <select id="reportStatusInput" class="form-control" required>
                                    <option value="Amaran Pertama">Amaran Pertama</option>
                                    <option value="Amaran Kedua">Amaran Kedua</option>
                                    <option value="Amaran Terakhir">Amaran Terakhir</option>
                                </select>
                            </div>
                            <button type="submit" class="btn btn-primary">Simpan Laporan</button>
                        </div>
                    </form>
                </div>
            `;
            setupAddReportForm(null, {
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
                currentUserData
            });
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
    };
}

