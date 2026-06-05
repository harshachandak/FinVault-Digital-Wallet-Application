// ================= CONNECTIVITY CONFIGURATION =================
const API_BASE_URL = 'https://finvault-backend-36ac.onrender.com/api';

// ================= CUSTOM POPUP TOAST SYSTEM =================
class Notification {
    static show(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        // Simple fallback style additions if stylesheet needs assistance
        toast.style.padding = "12px 20px";
        toast.style.margin = "10px";
        toast.style.borderRadius = "6px";
        toast.style.color = "#fff";
        toast.style.background = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3500);
    }
    static success(msg) { this.show(msg, 'success'); }
    static error(msg) { this.show(msg, 'error'); }
}

// ================= APP COORDINATOR CLASS =================
class WalletApp {
    constructor() {
        this.currentUser = null;
        this.activePendingTransaction = null; 
        this.initDOM();
        this.bindEvents();
    }

    initDOM() {
        this.loginPage = document.getElementById('login-page');
        this.registerPage = document.getElementById('register-page');
        this.appPage = document.getElementById('app-page');
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.paymentForm = document.getElementById('payment-form');
        this.toRegisterBtn = document.getElementById('to-register-btn');
        this.toLoginBtn = document.getElementById('to-login-btn');
        this.logoutBtn = document.getElementById('logout-btn');
        this.navItems = document.querySelectorAll('.nav-item');
        this.viewViews = document.querySelectorAll('.app-view');
        this.viewTitle = document.getElementById('view-title');
        this.pinModal = document.getElementById('pin-modal');
        this.modalPinInput = document.getElementById('modal-pin-input');
        this.confirmPaymentBtn = document.getElementById('confirm-payment-btn');
        this.cancelPaymentBtn = document.getElementById('cancel-payment-btn');
        this.closeModalBtn = document.getElementById('close-modal-btn');
    }

    bindEvents() {
        this.toRegisterBtn.addEventListener('click', () => this.showScreen('register'));
        this.toLoginBtn.addEventListener('click', () => this.showScreen('login'));
        this.logoutBtn.addEventListener('click', () => this.terminateSession());
        this.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.registerForm.addEventListener('submit', (e) => this.handleRegistration(e));
        this.paymentForm.addEventListener('submit', (e) => this.initiatePaymentValidation(e));
        this.cancelPaymentBtn.addEventListener('click', () => this.closePinModal());
        this.closeModalBtn.addEventListener('click', () => this.closePinModal());
        this.confirmPaymentBtn.addEventListener('click', () => this.processFinalPayment());

        this.navItems.forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.navItems.forEach(nav => nav.classList.remove('active'));
                e.target.classList.add('active');
                const currentTarget = e.target.getAttribute('data-target');
                this.switchActiveView(currentTarget, e.target.innerText.substring(2));
            });
        });
    }

    showScreen(screenName) {
        this.loginPage.classList.add('hidden');
        this.registerPage.classList.add('hidden');
        this.appPage.classList.add('hidden');

        if (screenName === 'login') this.loginPage.classList.remove('hidden');
        if (screenName === 'register') this.registerPage.classList.remove('hidden');
        if (screenName === 'app') this.appPage.classList.remove('hidden');
    }

    async switchActiveView(targetId, titleStr) {
        this.viewViews.forEach(view => view.classList.add('hidden'));
        document.getElementById(targetId).classList.remove('hidden');
        this.viewTitle.innerText = titleStr;
        
        if (this.currentUser) {
            await this.refreshUserContext(); 
        }
        this.renderAppStateUI(); 
    }

    // Pulls freshest user balance + lists from server database stream
    async refreshUserContext() {
        try {
            const response = await fetch(`${API_BASE_URL}/user/${this.currentUser.upiId}`);
            if (response.ok) {
                this.currentUser = await response.json();
            }
        } catch (err) {
            console.error("Failed to sync context with database:", err);
        }
    }

    // ================= WIRED API INTERACTIONS =================

    async handleRegistration(e) {
        e.preventDefault();
        
        const payload = {
            displayName: document.getElementById('reg-name').value.trim(),
            userId: document.getElementById('reg-userid').value.trim().toLowerCase(),
            email: document.getElementById('reg-email').value.trim(),
            phone: document.getElementById('reg-phone').value.trim(),
            balance: parseFloat(document.getElementById('reg-balance').value) || 0,
            pin: document.getElementById('reg-pin').value.trim()
        };

        try {
            // Send payload to Node server registration route
            const response = await fetch(`${API_BASE_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                Notification.error(data.message || "Registration failed!");
                return;
            }

            Notification.success(`Wallet account claimed: ${data.upiId}`);
            this.registerForm.reset();
            this.showScreen('login');
        } catch (err) {
            Notification.error("Cannot reach backend server. Is it running?");
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const payload = {
            upiId: document.getElementById('login-upi').value.trim().toLowerCase(),
            pin: document.getElementById('login-pin').value.trim()
        };

        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                Notification.error(data.message || "Login failed!");
                return;
            }

            this.currentUser = data; // User profile received without exposed pin
            this.showScreen('app');
            this.switchActiveView('dashboard-view', 'Dashboard');
            Notification.success(`Logged in as ${this.currentUser.displayName}`);
        } catch (err) {
            Notification.error("Authentication backend server offline.");
        }
    }

    initiatePaymentValidation(e) {
        e.preventDefault();
        const targetUpi = document.getElementById('send-upi').value.trim().toLowerCase();
        const amount = parseFloat(document.getElementById('send-amount').value);
        const remark = document.getElementById('send-remark').value.trim();

        if (targetUpi === this.currentUser.upiId) {
            Notification.error("Self-transfers are disabled.");
            return;
        }
        if (amount > this.currentUser.balance) {
            Notification.error("Insufficient wallet balance.");
            return;
        }

        this.activePendingTransaction = { targetUpi, amount, remark };
        this.modalPinInput.value = "";
        this.pinModal.classList.remove('hidden');
        this.modalPinInput.focus();
    }

    async processFinalPayment() {
        const pin = this.modalPinInput.value.trim();
        if (!pin) {
            Notification.error("Please provide your UPI security PIN.");
            return;
        }

        const payload = {
            senderUpi: this.currentUser.upiId,
            pin: pin,
            ...this.activePendingTransaction
        };

        try {
            const response = await fetch(`${API_BASE_URL}/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                Notification.error(data.message || "Transaction declined.");
                return;
            }

            this.currentUser = data.user; // Update interface context with returned profile
            this.closePinModal();
            this.paymentForm.reset();
            this.switchActiveView('dashboard-view', 'Dashboard');
            Notification.success(`₹${payload.amount} successfully transferred!`);
        } catch (err) {
            Notification.error("Transaction pipeline connection failure.");
        }
    }

    closePinModal() {
        this.pinModal.classList.add('hidden');
        this.activePendingTransaction = null;
    }

    // Helper to extract spent funds locally for instant display calculation
    getTodaySpentAmount() {
        const todayStr = new Date().toDateString();
        return this.currentUser.transactions
            .filter(tx => tx.type === 'out' && new Date(tx.date).toDateString() === todayStr)
            .reduce((sum, tx) => sum + tx.amount, 0);
    }

    renderAppStateUI() {
        if (!this.currentUser) return;

        const letter = this.currentUser.displayName.charAt(0).toUpperCase();
        document.getElementById('header-avatar').innerText = letter;
        document.getElementById('prof-avatar').innerText = letter;
        document.getElementById('header-username').innerText = this.currentUser.displayName;
        document.getElementById('header-upi').innerText = this.currentUser.upiId;

        let totalSent = 0, totalRecv = 0;
        this.currentUser.transactions.forEach(tx => {
            if (tx.type === 'out') totalSent += tx.amount;
            if (tx.type === 'in') totalRecv += tx.amount;
        });

        document.getElementById('dash-balance').innerText = this.currentUser.balance.toLocaleString('en-IN');
        document.getElementById('dash-upi').innerText = this.currentUser.upiId;
        document.getElementById('dash-tx-count').innerText = this.currentUser.transactions.length;
        document.getElementById('stat-sent').innerText = totalSent.toLocaleString('en-IN');
        document.getElementById('stat-received').innerText = totalRecv.toLocaleString('en-IN');
        document.getElementById('dash-spent').innerText = this.getTodaySpentAmount().toLocaleString('en-IN');

        this.populateTxLists();
        this.populateProfileAndContacts();
    }

    populateTxLists() {
        let htmlRows = "";
        if (this.currentUser.transactions.length === 0) {
            htmlRows = `<p class="muted-text" style="padding:15px; text-align:center;">No transaction histories logged yet.</p>`;
        } else {
            this.currentUser.transactions.forEach(tx => {
                const isOut = tx.type === 'out';
                const dateString = new Date(tx.date).toLocaleDateString('en-IN');
                htmlRows += `
                    <div class="tx-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #2d2d2d;">
                        <div class="tx-info" style="display:flex; align-items:center; gap:12px;">
                            <div class="tx-icon ${tx.type}" style="font-weight:bold; color:${isOut?'#ef4444':'#10b981'}">${isOut ? '↗' : '↙'}</div>
                            <div>
                                <h4 style="margin:0; font-size:0.95rem;">${isOut ? 'Sent to' : 'Received from'} ${tx.target}</h4>
                                <small class="muted-text" style="color:#888;">${dateString} • <i>${tx.remark}</i></small>
                            </div>
                        </div>
                        <h4 class="${isOut ? 'text-danger' : 'text-success'}" style="margin:0; color:${isOut?'#ef4444':'#10b981'}">
                            ${isOut ? '-' : '+'}${(tx.amount).toLocaleString('en-IN')}
                        </h4>
                    </div>`;
            });
        }
        document.getElementById('dash-tx-list').innerHTML = htmlRows;
        document.getElementById('history-tx-list').innerHTML = htmlRows;
    }

    populateProfileAndContacts() {
        document.getElementById('prof-name').innerText = this.currentUser.displayName;
        document.getElementById('prof-upi').innerText = this.currentUser.upiId;
        document.getElementById('info-id').innerText = this.currentUser.userId;
        document.getElementById('info-name').innerText = this.currentUser.displayName;
        document.getElementById('info-email').innerText = this.currentUser.email;
        document.getElementById('info-phone').innerText = this.currentUser.phone;

        const contactsContainer = document.getElementById('contacts-list');
        const uniqueTargets = [...new Set(this.currentUser.transactions.map(t => t.target))];
        
        if (uniqueTargets.length === 0) {
            contactsContainer.innerHTML = `<p class="muted-text" style="text-align:center; padding:10px;">No recent payees recorded.</p>`;
        } else {
            contactsContainer.innerHTML = uniqueTargets.slice(0, 3).map(target => `
                <div class="contact-row" style="display:flex; align-items:center; gap:10px; padding:8px; cursor:pointer;" onclick="document.getElementById('send-upi').value='${target}'">
                    <div class="avatar" style="width:30px; height:30px; border-radius:50%; background:#3b82f6; display:flex; align-items:center; justify-content:center; font-size:0.8rem; color:#fff;">${target.charAt(0).toUpperCase()}</div>
                    <div>
                        <strong style="font-size:0.9rem;">${target.split('@')[0]}</strong><br/>
                        <small class="muted-text" style="color:#888; font-size:0.75rem;">${target}</small>
                    </div>
                </div>
            `).join('');
        }
    }

    terminateSession() {
        this.currentUser = null;
        this.loginForm.reset();
        this.showScreen('login');
        Notification.success("Session closed safely.");
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.AppEngine = new WalletApp();
});
