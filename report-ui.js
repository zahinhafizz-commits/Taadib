export function createReportUiService({ getMeritBadgeTier, getStatusBadgeClass, getStudentList }) {
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
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeModal();
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

    function renderStudentTableRows(list, visibleCount = list.length, includeReportAction = false) {
        const columnCount = includeReportAction ? 5 : 6;
        if (!list.length) return `<tr><td colspan="${columnCount}" style="text-align:center;">Tiada rekod pelajar dijumpai.</td></tr>`;
        return list.slice(0, visibleCount).map(student => {
            const score = Number(student.markah_disiplin ?? 100);
            const badge = getMeritBadgeTier(score);
            return `
                <tr>
                    <td><strong>${student.no_matriks}</strong></td>
                    <td>${student.nama}</td>
                    <td>${student.jabatan}</td>
                    <td>${student.blok_asrama}</td>
                    ${includeReportAction ? `<td><button class="btn btn-primary" style="padding: 6px 16px; font-size: 13px;" onclick="window.bukaDaftarKesPelajar('${student.no_matriks}')"><i class="fas fa-plus"></i> Laporan</button></td>` : `<td>${score}</td><td><span class="merit-mini-badge ${badge.className}">${badge.icon} ${badge.label}</span></td>`}
                </tr>
            `;
        }).join('');
    }

    function renderReportsTableRows(list, includeReportAction = false) {
        const studentList = getStudentList();
        if (!list.length) return `<tr><td colspan="${includeReportAction ? 9 : 8}" style="text-align:center;">Tiada laporan disimpan.</td></tr>`;
        return list.map(report => {
            const studentInfo = studentList.find(student => student.no_matriks === report.no_matriks?.toUpperCase());
            const block = report.blok_asrama || studentInfo?.blok_asrama || "-";
            const studentName = report.nama_pelajar || studentInfo?.nama || '-';
            return `
                <tr>
                    <td>${report.tarikh || '-'}</td>
                    <td><strong>${report.no_matriks || '-'}</strong></td>
                    <td>${studentName}</td>
                    <td>${report.jabatan || '-'}</td>
                    <td>${block}</td>
                    <td>${report.kategori_kes || '-'}</td>
                    <td>${report.gambar_url ? `<a href="${report.gambar_url}" class="report-image-preview-link" data-report-image="${report.gambar_url}" title="Lihat gambar penuh"><img src="${report.gambar_url}" alt="Bukti laporan" style="width:40px; height:40px; object-fit:cover; border-radius:6px; cursor:zoom-in;"></a>` : 'Tiada'}</td>
                    <td><span class="status-badge ${getStatusBadgeClass(report.status_amaran)}">${report.status_amaran || 'Amaran Pertama'}</span></td>
                    ${includeReportAction ? `<td><button class="btn btn-primary" style="padding: 6px 16px; font-size: 13px;" onclick="window.bukaDaftarKesPelajar('${report.no_matriks || ''}')"><i class="fas fa-plus"></i> Laporan</button></td>` : ''}
                </tr>
            `;
        }).join('');
    }

    function bindReportImagePreviews(container = document) {
        container.querySelectorAll('.report-image-preview-link').forEach(link => {
            link.addEventListener('click', event => {
                event.preventDefault();

                const modal = document.createElement('div');
                modal.className = 'report-image-modal';
                modal.innerHTML = `
                    <div class="report-image-modal-content">
                        <div class="report-image-modal-toolbar" aria-label="Kawalan gambar">
                            <button type="button" class="report-image-zoom-out" aria-label="Zum keluar">&minus;</button>
                            <button type="button" class="report-image-zoom-reset" aria-label="Set semula zum">100%</button>
                            <button type="button" class="report-image-zoom-in" aria-label="Zum masuk">+</button>
                        </div>
                        <button type="button" class="report-image-modal-close" aria-label="Tutup gambar">&times;</button>
                        <img class="report-image-modal-image" src="${link.dataset.reportImage}" alt="Bukti laporan penuh">
                    </div>
                `;

                const image = modal.querySelector('.report-image-modal-image');
                let zoom = 1;
                const updateZoom = () => {
                    image.style.transform = `scale(${zoom})`;
                    modal.querySelector('.report-image-zoom-reset').textContent = `${Math.round(zoom * 100)}%`;
                };
                const closeModal = () => modal.remove();
                modal.querySelector('.report-image-modal-close').addEventListener('click', closeModal);
                modal.querySelector('.report-image-zoom-in').addEventListener('click', () => {
                    zoom = Math.min(4, zoom + 0.25);
                    updateZoom();
                });
                modal.querySelector('.report-image-zoom-out').addEventListener('click', () => {
                    zoom = Math.max(0.5, zoom - 0.25);
                    updateZoom();
                });
                modal.querySelector('.report-image-zoom-reset').addEventListener('click', () => {
                    zoom = 1;
                    updateZoom();
                });
                modal.addEventListener('wheel', event => {
                    event.preventDefault();
                    zoom = Math.min(4, Math.max(0.5, zoom + (event.deltaY < 0 ? 0.25 : -0.25)));
                    updateZoom();
                }, { passive: false });
                modal.addEventListener('click', event => {
                    if (event.target === modal) closeModal();
                });
                document.body.appendChild(modal);
            });
        });
    }

    return {
        showReportPopup,
        matchStudentTableSearch,
        renderStudentTableRows,
        renderReportsTableRows,
        bindReportImagePreviews
    };
}
