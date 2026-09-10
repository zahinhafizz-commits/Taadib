export function renderSidebarNavigation(role, loadPanelContent, logoutUser) {
    const navMenu = document.getElementById("navMenu");
    if (!navMenu) return;

    let navHTML = "";

    if (role === 'warden') {
        navHTML += `<button class="nav-item active" data-panel="dashboard"><i class="fas fa-chart-pie"></i> Dashboard</button>`;
        navHTML += `<button class="nav-item" data-panel="senaraiKes"><i class="fas fa-file-medical"></i> Daftar Kes</button>`;
        navHTML += `<button class="nav-item" data-panel="senaraiPelajar"><i class="fas fa-users"></i> Status Pelajar</button>`;
        navHTML += `<button class="nav-item" data-panel="laporan"><i class="fas fa-plus-circle"></i> Laporan Kes</button>`;
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
    logoutBtn.addEventListener('click', () => {
        if (typeof logoutUser === 'function') {
            logoutUser();
        }
    });
    navMenu.appendChild(logoutBtn);

    document.querySelectorAll(".nav-item[data-panel]").forEach(button => {
        button.addEventListener("click", (e) => {
            document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
            const targetBtn = e.currentTarget;
            targetBtn.classList.add("active");
            if (typeof loadPanelContent === 'function') {
                loadPanelContent(targetBtn.getAttribute("data-panel"));
            }
        });
    });
}
