export function renderSidebarNavigation(role, loadPanelContent, logoutUser, openChangePassword) {
    const navMenu = document.getElementById("navMenu");
    if (!navMenu) return;

    async function loadPanel(panelName) {
        try {
            await loadPanelContent(panelName);
        } catch (error) {
            console.error(`Panel loading failed for ${panelName}:`, error);
            const contentPanel = document.getElementById("contentPanels");
            if (!contentPanel) return;

            const card = document.createElement("div");
            card.className = "card-box";
            const heading = document.createElement("h3");
            heading.textContent = "Gagal memuatkan panel";
            const message = document.createElement("p");
            message.textContent = error?.code === "permission-denied"
                ? "Akses ditolak. Pastikan peraturan Firestore telah diterbitkan dan akaun anda mempunyai peranan staf yang dibenarkan."
                : error?.message || "Ralat tidak diketahui. Sila cuba lagi.";
            card.append(heading, message);
            contentPanel.replaceChildren(card);
        }
    }

    let navHTML = "";

    const isWarden = role === 'warden' || role === 'ketua_warden';

    if (isWarden) {
        navHTML += `<button class="nav-item active" data-panel="dashboard"><i class="fas fa-chart-pie"></i> Dashboard</button>`;
        navHTML += `<button class="nav-item" data-panel="senaraiKes"><i class="fas fa-file-medical"></i> Daftar Kes</button>`;
        navHTML += `<button class="nav-item" data-panel="senaraiPelajar"><i class="fas fa-users"></i> Status Pelajar</button>`;
        navHTML += `<button class="nav-item" data-panel="laporan"><i class="fas fa-plus-circle"></i> Laporan Kes</button>`;
        if (role === 'ketua_warden') {
            navHTML += `<button class="nav-item" data-panel="tindakanAmaran"><i class="fas fa-exclamation-triangle"></i> Tindakan Amaran</button>`;
        }
        navHTML += `<button class="nav-item" data-panel="resetPassword"><i class="fas fa-key"></i> Reset Kata Laluan</button>`;
    } else if (role === 'admin') {
        navHTML += `<button class="nav-item active" data-panel="admin"><i class="fas fa-user-shield"></i> Admin</button>`;
    } else {
        navHTML += `<button class="nav-item active" data-panel="rekodSaya"><i class="fas fa-user-shield"></i> Rekod Disiplin Saya</button>`;
    }

    navMenu.innerHTML = navHTML;

    if (isWarden || role === 'admin') {
        const changePasswordBtn = document.createElement('button');
        changePasswordBtn.className = 'nav-item change-password-btn';
        changePasswordBtn.innerHTML = '<i class="fas fa-key"></i> Tukar Kata Laluan';
        changePasswordBtn.addEventListener('click', () => {
            if (typeof openChangePassword === 'function') {
                openChangePassword();
            }
        });
        navMenu.appendChild(changePasswordBtn);
    }

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
                loadPanel(targetBtn.getAttribute("data-panel"));
            }
        });
    });
}
