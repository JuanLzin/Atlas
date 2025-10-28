import {
    doc,
    collection,
    writeBatch,
    query,
    where,
    getDocs,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { AuthService } from './auth.js';
import { DBService } from './database.js';
import { UI } from './ui.js'; // Importa o novo módulo UI
import { db } from './firebase.js';

/* --- MÓDULO PRINCIPAL DA APLICAÇÃO --- */
const App = {
    state: {
        clients: [],
        sales: [],
        installments: [],
        despesas: [],
        orcamentos: [],
        settings: {},
        selectedClients: [],
        selectedInstallments: [],
        selectedDespesas: [],
        clientSort: { key: 'createdAt', direction: 'desc' },
        notifications: [],
    },
    initialDataLoadStatus: {
        clients: false,
        despesas: false,
        orcamentos: false,
        settings: false,
    },
    unsubscribeListeners: [],
    paymentOverviewChart: null,
    salesFunnelChart: null,
    topClientsChart: null,
    expensesByCategoryChart: null,
    clientBillingHistoryChart: null,

    async init() {
        try {
            const user = await AuthService.handleAuth();
            if (user) {
                this.showAppView();
            } else {
                this.showAuthView();
            }
        } catch (error) {
            console.error("Falha na inicialização do Firebase. Verifique a configuração.", error);
            this.showAuthView();
        } finally {
            document.getElementById('loadingView').classList.add('hidden');
        }
    },

    showAuthView() {
        document.getElementById('authView').classList.remove('hidden');
        document.getElementById('authView').classList.add('flex');
        document.getElementById('appView').classList.add('hidden');
        document.getElementById('fab-container').classList.add('hidden');
        const loginForm = document.getElementById('loginForm'), registerForm = document.getElementById('registerForm'), showRegister = document.getElementById('showRegister'), showLogin = document.getElementById('showLogin'), authError = document.getElementById('authError');
        showRegister.addEventListener('click', (e) => { e.preventDefault(); loginForm.classList.add('hidden'); registerForm.classList.remove('hidden'); authError.textContent = ''; });
        showLogin.addEventListener('click', (e) => { e.preventDefault(); registerForm.classList.add('hidden'); loginForm.classList.remove('hidden'); authError.textContent = ''; });
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            UI.setButtonLoading(submitBtn, true, 'A entrar...'); // UI.setButtonLoading
            try {
                await AuthService.login(e.target.loginEmail.value, e.target.loginPassword.value);
                window.location.reload();
            } catch (err) {
                authError.textContent = 'Email ou senha inválidos.';
            } finally {
                UI.setButtonLoading(submitBtn, false, 'Entrar'); // UI.setButtonLoading
            }
        });
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            UI.setButtonLoading(submitBtn, true, 'A criar...');
            authError.textContent = '';
            try {
                await AuthService.register(e.target.registerName.value, e.target.registerEmail.value, e.target.registerPassword.value);
                window.location.reload();
            } catch (err) {
                let message = 'Ocorreu um erro desconhecido.';
                if (err && err.code) {
                    switch (err.code) {
                        case 'auth/email-already-in-use': message = 'Este email já está registado.'; break;
                        case 'auth/invalid-email': message = 'O formato do email é inválido.'; break;
                        case 'auth/weak-password': message = 'A senha deve ter pelo menos 6 caracteres.'; break;
                        default: message = `Erro ao criar conta. (${err.message})`;
                    }
                }
                authError.textContent = message;
            } finally {
                UI.setButtonLoading(submitBtn, false, 'Criar Conta');
            }
        });
    },

    showAppView() {
        document.getElementById('authView').classList.add('hidden');
        document.getElementById('authView').classList.remove('flex');
        const appView = document.getElementById('appView');
        appView.classList.remove('hidden');
        appView.classList.add('flex'); // A FAB é controlada pela função navigateTo

        this.renderUserProfile();
        this.setupRealtimeListeners();

        document.getElementById('navDashboard').addEventListener('click', (e) => { e.preventDefault(); this.navigateTo('dashboard'); });
        document.getElementById('navOrcamentos').addEventListener('click', (e) => { e.preventDefault(); this.navigateTo('orcamentos'); });
        document.getElementById('navRecebimentos').addEventListener('click', (e) => { e.preventDefault(); this.navigateTo('recebimentos'); });
        document.getElementById('navDespesas').addEventListener('click', (e) => { e.preventDefault(); this.navigateTo('despesas'); });
        document.getElementById('navClients').addEventListener('click', (e) => { e.preventDefault(); this.navigateTo('clients'); });
        document.getElementById('navSettings').addEventListener('click', (e) => { e.preventDefault(); this.navigateTo('settings'); });

        this.setupGlobalEventListeners();
        this.navigateTo('dashboard');
    },

    setupRealtimeListeners() {
        const handleDataLoad = (collectionName, data) => {
            this.state[collectionName] = data;
            if (this.initialDataLoadStatus[collectionName] === false) {
                this.initialDataLoadStatus[collectionName] = true;
            }
            this.rerenderCurrentView();
        };

        this.unsubscribeListeners.push(DBService.listenToCollection('clients', (data) => {
            handleDataLoad('clients', data);
        }));
        this.unsubscribeListeners.push(DBService.listenToCollection('sales', (data) => {
            this.state.sales = data;
            this.rerenderCurrentView();
        }));
        this.unsubscribeListeners.push(DBService.listenToCollection('installments', (data) => {
            this.state.installments = data;
            this.rerenderCurrentView();
        }));
        this.unsubscribeListeners.push(DBService.listenToCollection('despesas', (data) => {
            handleDataLoad('despesas', data);
        }));
        this.unsubscribeListeners.push(DBService.listenToCollection('settings', (data) => {
            if (data.length > 0) {
                this.state.settings = { ...this.state.settings, ...data[0] };
            }
            if (this.initialDataLoadStatus.settings === false) {
                this.initialDataLoadStatus.settings = true;
            }
            this.rerenderCurrentView();
        }));
        this.unsubscribeListeners.push(DBService.listenToCollection('orcamentos', (data) => {
            handleDataLoad('orcamentos', data);
        }));
    },

    checkOnboarding() {
        const allLoaded = Object.values(this.initialDataLoadStatus).every(status => status === true);
        if (!allLoaded) return;

        const isNewUser = this.state.clients.length === 0 && this.state.despesas.length === 0 && this.state.orcamentos.length === 0;
        const onboardingCompleted = this.state.settings.onboardingCompleted === true;

        if (isNewUser && !onboardingCompleted) {
            this.startOnboarding();
        }
    },

    rerenderCurrentView() {
        this.checkNotifications();
        this.renderNotifications();

        const activeLink = document.querySelector('.nav-link.active');
        let currentView = 'dashboard';
        if (activeLink) {
            currentView = activeLink.id.replace('nav', '').toLowerCase();
        } else if (document.getElementById('settingsView')) {
            currentView = 'settings';
        }

        if (document.getElementById(`${currentView}View`)) {
            this.navigateTo(currentView, true); // Pass true to prevent re-rendering logic
        }
    },

    renderUserProfile() {
        const user = AuthService.currentUser;
        if (user) {
            const displayName = user.name || user.displayName || 'Usuário';
            const initials = displayName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '..';

            const notificationArea = document.getElementById('notificationArea');
            notificationArea.innerHTML = `
                        <button id="notificationBtn" class="relative text-slate-500 hover:text-slate-700">
                            <span class="material-symbols-outlined">notifications</span>
                            <span id="notification-badge" class="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white hidden"></span>
                        </button>
                        <div id="notification-panel" class="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl py-1 hidden z-20 border border-slate-200">
                            <div class="p-4 border-b border-slate-200">
                                <h3 class="font-semibold text-slate-800">Notificações</h3>
                            </div>
                            <div id="notification-list" class="max-h-96 overflow-y-auto"></div>
                        </div>
                    `;

            const headerProfileHTML = `
                        <div id="profileCardBtn" class="flex items-center cursor-pointer">
                            <div class="text-right mr-3 hidden sm:block">
                                <p class="font-semibold text-sm text-slate-800 truncate">${displayName}</p>
                                <p class="text-xs text-slate-500 truncate">${user.email}</p>
                            </div>
                            <div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">${initials}</div>
                             <svg id="headerChevron" class="w-5 h-5 text-slate-400 ml-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                        <div id="profileSubmenu" class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 hidden z-10 ring-1 ring-black ring-opacity-5">
                            <a href="#" id="profileSettingsBtn" class="flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
                                <span class="material-symbols-outlined mr-3 text-slate-500 text-base">settings</span>
                                Configurações
                            </a>
                            <a href="#" id="logoutBtn" class="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-slate-100">
                                <span class="material-symbols-outlined mr-3 text-base">logout</span>
                                Sair
                            </a>
                        </div>`;
            document.getElementById('headerProfile').innerHTML = headerProfileHTML;

            const sidebarProfile = document.getElementById('sidebarProfile');
            if (sidebarProfile) {
                sidebarProfile.innerHTML = `
                        <div class="p-4 border-t border-slate-200">
                            <div class="flex items-center">
                                <div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm mr-3 flex-shrink-0">${initials}</div>
                                <div class="overflow-hidden">
                                    <p class="font-semibold text-sm text-slate-800 truncate">${displayName}</p>
                                    <p class="text-xs text-slate-500 truncate">${user.email}</p>
                                </div>
                            </div>
                        </div>`;
            }

            const profileCardBtn = document.getElementById('profileCardBtn');
            const profileSubmenu = document.getElementById('profileSubmenu');
            const headerChevron = document.getElementById('headerChevron');

            profileCardBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                profileSubmenu.classList.toggle('hidden');
                headerChevron.classList.toggle('rotate-180');
            });
            profileSubmenu.querySelector('#logoutBtn').addEventListener('click', async (e) => { e.preventDefault(); await AuthService.logout(); window.location.reload(); });
            profileSubmenu.querySelector('#profileSettingsBtn').addEventListener('click', (e) => { e.preventDefault(); this.navigateTo('settings'); profileSubmenu.classList.add('hidden'); headerChevron.classList.remove('rotate-180'); });

            window.addEventListener('click', (e) => {
                if (profileSubmenu && !profileSubmenu.classList.contains('hidden') && !profileCardBtn.contains(e.target)) {
                    profileSubmenu.classList.add('hidden');
                    headerChevron.classList.remove('rotate-180');
                }
            });
        }
    },

    navigateTo(view, isRerender = false, param = null) {
        if (view === 'clientDetail') this.state.currentClientId = param;
        if (!isRerender && view !== 'clients') {
            this.state.selectedClients = [];
        }

        if (view === 'dashboard') {
            fabContainer.classList.remove('hidden');
        } else {
            fabContainer.classList.add('hidden');
        }

        const mainContent = document.getElementById('mainContent');
        const fabContainer = document.getElementById('fab-container');
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

        if (view === 'dashboard') {
            fabContainer.classList.remove('hidden');
        } else {
            fabContainer.classList.add('hidden');
        }

        const navigate = () => {
            if (views[view]) {
                document.getElementById('pageTitle').textContent = views[view].title;
                if (!isRerender) {
                    mainContent.innerHTML = document.getElementById(views[view].templateId).innerHTML;
                }
                if (views[view].navId) {
                    const navEl = document.getElementById(views[view].navId);
                    if (navEl) navEl.classList.add('active');
                }
                views[view].renderFunc.call(this, param || this.state.currentClientId);
            }
        };

        const views = {
            dashboard: { templateId: 'dashboardTemplate', navId: 'navDashboard', renderFunc: this.renderDashboard, title: "Painel Principal" },
            orcamentos: { templateId: 'orcamentosTemplate', navId: 'navOrcamentos', renderFunc: this.renderOrcamentosPage, title: "Orçamentos" },
            recebimentos: { templateId: 'recebimentosTemplate', navId: 'navRecebimentos', renderFunc: this.renderRecebimentosPage, title: "Meus Recebimentos" },
            despesas: { templateId: 'despesasTemplate', navId: 'navDespesas', renderFunc: this.renderDespesasPage, title: "Minhas Despesas" },
            clients: { templateId: 'clientsTemplate', navId: 'navClients', renderFunc: this.renderClientsPage, title: "Meus Clientes" },
            settings: { templateId: 'settingsTemplate', navId: 'navSettings', renderFunc: this.renderSettingsPage, title: "Configurações" },
            clientDetail: { templateId: 'clientDetailTemplate', navId: 'navClients', renderFunc: this.renderClientDetailPage, title: "Detalhes do Cliente" }
        };

        if (isRerender) {
            navigate();
        } else {
            mainContent.classList.add('fade-out');
            setTimeout(() => {
                navigate();
                mainContent.classList.remove('fade-out');
            }, 150); // Deve corresponder à duração da transição do CSS
        }
    },

    // =================================================================
    // DASHBOARD LOGIC (NEW)
    // =================================================================
    renderDashboard() {
        const hour = new Date().getHours();
        let greetingMsg = "Bom dia";
        if (hour >= 12 && hour < 18) { greetingMsg = "Boa tarde"; }
        else if (hour >= 18 || hour < 5) { greetingMsg = "Boa noite"; }
        const displayName = AuthService.currentUser.displayName || AuthService.currentUser.name || '';
        document.getElementById('greeting').textContent = `${greetingMsg}, ${displayName.split(' ')[0]}!`;

        this.renderKpis();
        this.renderPaymentOverviewChart();
        this.renderSalesFunnelChart();
        this.renderAccountsReceivable();
        this.renderTopClientsChart();
        this.renderExpensesByCategoryChart();
    },

    renderKpis() {
        const formatCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const receitaMes = this.state.installments
            .filter(i => {
                if (i.status !== 'paid' || !i.paidDate) return false;
                const paidDate = this.safeParseDate(i.paidDate);
                return paidDate.getMonth() === currentMonth && paidDate.getFullYear() === currentYear;
            })
            .reduce((sum, i) => sum + i.value, 0);

        const despesasMes = this.state.despesas
            .filter(d => {
                const expenseDate = this.safeParseDate(d.date);
                return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
            })
            .reduce((sum, d) => sum + d.value, 0);

        const saldoMes = receitaMes - despesasMes;

        const orcamentosAberto = this.state.orcamentos
            .filter(o => o.status === 'Enviado')
            .reduce((sum, o) => sum + o.totalValue, 0);

        document.getElementById('kpiReceitaMes').textContent = formatCurrency(receitaMes);
        document.getElementById('kpiDespesasMes').textContent = formatCurrency(despesasMes);
        const saldoEl = document.getElementById('kpiSaldoMes');
        saldoEl.textContent = formatCurrency(saldoMes);
        saldoEl.classList.toggle('text-green-600', saldoMes >= 0);
        saldoEl.classList.toggle('text-red-600', saldoMes < 0);
        document.getElementById('kpiOrcamentosAberto').textContent = formatCurrency(orcamentosAberto);
    },

    renderPaymentOverviewChart() {
        const ctx = document.getElementById('paymentOverviewChart')?.getContext('2d');
        if (!ctx) return;
        if (this.paymentOverviewChart) this.paymentOverviewChart.destroy();

        const labels = [];
        const revenueData = [];
        const expenseData = [];
        const today = new Date();

        for (let i = 11; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            labels.push(d.toLocaleString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', ''));
            const month = d.getMonth();
            const year = d.getFullYear();

            const monthlyRevenue = this.state.installments
                .filter(inst => {
                    if (inst.status !== 'paid' || !inst.paidDate) return false;
                    const paidDate = this.safeParseDate(inst.paidDate);
                    return paidDate.getMonth() === month && paidDate.getFullYear() === year;
                })
                .reduce((sum, inst) => sum + inst.value, 0);
            revenueData.push(monthlyRevenue);

            const monthlyExpenses = this.state.despesas
                .filter(exp => {
                    const expenseDate = this.safeParseDate(exp.date);
                    return expenseDate.getMonth() === month && expenseDate.getFullYear() === year;
                })
                .reduce((sum, exp) => sum + exp.value, 0);
            expenseData.push(monthlyExpenses);
        }

        this.paymentOverviewChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Receita', data: revenueData, backgroundColor: '#16a34a' },
                    { label: 'Despesa', data: expenseData, backgroundColor: '#dc2626' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', align: 'end' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    },

    renderSalesFunnelChart() {
        const ctx = document.getElementById('salesFunnelChart')?.getContext('2d');
        if (!ctx) return;
        if (this.salesFunnelChart) this.salesFunnelChart.destroy();

        const currentYear = new Date().getFullYear();

        const valorOrcado = this.state.orcamentos
            .filter(o => this.safeParseDate(o.date).getFullYear() === currentYear)
            .reduce((sum, o) => sum + o.totalValue, 0);

        const valorAprovado = this.state.orcamentos
            .filter(o => o.status === 'Aprovado' && this.safeParseDate(o.date).getFullYear() === currentYear)
            .reduce((sum, o) => sum + o.totalValue, 0);

        this.salesFunnelChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Valor Orçado', 'Valor Aprovado'],
                datasets: [{
                    label: 'Total (R$)',
                    data: [valorOrcado, valorAprovado],
                    backgroundColor: ['#3b82f6', '#16a34a'],
                    barThickness: 50
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    },

    renderAccountsReceivable() {
        const overdueListEl = document.getElementById('overdueInstallmentsList');
        const upcomingListEl = document.getElementById('upcomingInstallmentsList');
        if (!overdueListEl || !upcomingListEl) return;

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const limitDate = new Date(); limitDate.setDate(today.getDate() + 15);

        const pendingInstallments = this.state.installments.filter(i => i.status === 'pending');

        const overdue = pendingInstallments
            .filter(i => this.safeParseDate(i.dueDate) < today)
            .sort((a, b) => this.safeParseDate(a.dueDate) - this.safeParseDate(b.dueDate));

        const upcoming = pendingInstallments
            .filter(i => {
                const dueDate = this.safeParseDate(i.dueDate);
                return dueDate >= today && dueDate <= limitDate;
            })
            .sort((a, b) => this.safeParseDate(a.dueDate) - this.safeParseDate(b.dueDate));

        const renderList = (element, installments, emptyMsg) => {
            if (installments.length === 0) {
                element.innerHTML = `<p class="text-sm text-slate-500">${emptyMsg}</p>`;
                return;
            }
            element.innerHTML = installments.map(inst => {
                const client = this.state.clients.find(c => c.id === inst.clientId);
                return `
                            <div class="text-sm">
                                <p class="font-semibold text-slate-700 truncate">${client?.name || 'Cliente não encontrado'}</p>
                                <div class="flex justify-between items-center text-slate-500">
                                    <span>${this.safeParseDate(inst.dueDate).toLocaleDateString('pt-BR')}</span>
                                    <span class="font-bold">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}</span>
                                </div>
                            </div>
                        `;
            }).join('');
        };

        renderList(overdueListEl, overdue, "Nenhuma conta vencida. Ótimo trabalho!");
        renderList(upcomingListEl, upcoming, "Nenhuma conta a vencer nos próximos 15 dias.");
    },

    renderTopClientsChart() {
        const ctx = document.getElementById('topClientsChart')?.getContext('2d');
        if (!ctx) return;
        if (this.topClientsChart) this.topClientsChart.destroy();

        const currentYear = new Date().getFullYear();
        const revenueByClient = {};

        this.state.installments
            .filter(i => i.status === 'paid' && this.safeParseDate(i.paidDate).getFullYear() === currentYear)
            .forEach(inst => {
                revenueByClient[inst.clientId] = (revenueByClient[inst.clientId] || 0) + inst.value;
            });

        const sortedClients = Object.entries(revenueByClient)
            .map(([clientId, total]) => ({
                name: this.state.clients.find(c => c.id === clientId)?.name || 'Cliente Apagado',
                total
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)
            .reverse(); // Para exibir o maior no topo do gráfico horizontal

        this.topClientsChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedClients.map(c => c.name),
                datasets: [{
                    label: 'Receita (R$)',
                    data: sortedClients.map(c => c.total),
                    backgroundColor: '#4338ca'
                }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    },

    renderExpensesByCategoryChart() {
        const ctx = document.getElementById('expensesByCategoryChart')?.getContext('2d');
        if (!ctx) return;
        if (this.expensesByCategoryChart) this.expensesByCategoryChart.destroy();

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const expensesByCategory = {};
        this.state.despesas
            .filter(d => {
                const expenseDate = this.safeParseDate(d.date);
                return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
            })
            .forEach(exp => {
                const category = exp.category || 'Sem Categoria';
                expensesByCategory[category] = (expensesByCategory[category] || 0) + exp.value;
            });

        const labels = Object.keys(expensesByCategory);
        const data = Object.values(expensesByCategory);

        if (labels.length === 0) {
            const parent = ctx.canvas.parentElement;
            if (parent) parent.innerHTML = '<div class="text-center text-slate-500 my-auto p-4">Nenhuma despesa registrada este mês.</div><canvas id="expensesByCategoryChart" class="hidden"></canvas>';
            return;
        }

        this.expensesByCategoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Total (R$)',
                    data: data,
                    backgroundColor: ['#4f46e5', '#7c3aed', '#a855f7', '#d946ef', '#db2777', '#f43f5e'],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    },

    // =================================================================
    // OTHER PAGES LOGIC
    // =================================================================
    safeParseDate(dateString) {
        if (!dateString) return null;
        if (dateString.includes('T')) {
            return new Date(dateString);
        }
        const parts = dateString.split('-').map(Number);
        return new Date(parts[0], parts[1] - 1, parts[2]);
    },

    renderClientsPage() {
        document.getElementById('clientSearch').addEventListener('input', (e) => this.renderClientsList(e.target.value));
        document.getElementById('exportClientsBtn').addEventListener('click', () => this.exportClientsData());
        document.getElementById('deleteSelectedClientsBtn').addEventListener('click', () => this.deleteSelectedClients());

        const clientSortMobile = document.getElementById('clientSortMobile');
        if (clientSortMobile) {
            clientSortMobile.addEventListener('change', (e) => {
                const [key, direction] = e.target.value.split('_');
                this.state.clientSort = { key, direction };
                this.renderClientsList(document.getElementById('clientSearch').value);
            });
        }

        document.querySelectorAll('[data-sort]').forEach(button => {
            button.addEventListener('click', () => {
                const sortKey = button.dataset.sort;
                const currentSort = this.state.clientSort;
                const newDirection = currentSort.key === sortKey && currentSort.direction === 'desc' ? 'asc' : 'desc';
                this.state.clientSort = { key: sortKey, direction: newDirection };
                this.renderClientsList(document.getElementById('clientSearch').value);
            });
        });

        const clientsView = document.getElementById('clientsView');

        clientsView.addEventListener('change', (e) => {
            if (e.target.matches('.client-checkbox')) {
                const clientId = e.target.dataset.id;
                if (e.target.checked) {
                    if (!this.state.selectedClients.includes(clientId)) {
                        this.state.selectedClients.push(clientId);
                    }
                } else {
                    this.state.selectedClients = this.state.selectedClients.filter(id => id !== clientId);
                }
                this.updateClientActions();
            }

            if (e.target.matches('#selectAllClientsCheckbox')) {
                const checkboxes = clientsView.querySelectorAll('.client-checkbox');
                if (e.target.checked) {
                    this.state.selectedClients = Array.from(checkboxes).map(cb => cb.dataset.id);
                    checkboxes.forEach(cb => cb.checked = true);
                } else {
                    this.state.selectedClients = [];
                    checkboxes.forEach(cb => cb.checked = false);
                }
                this.updateClientActions();
            }
        });

        this.renderClientsList();
        this.updateClientActions();
    },

    updateExportButtonAndSelectAll() {
        const exportBtn = document.getElementById('exportClientsBtn');
        const selectAllCheckbox = document.getElementById('selectAllClientsCheckbox');
        if (!exportBtn || !selectAllCheckbox) return;

        const selectedCount = this.state.selectedClients.length;

        if (selectedCount > 0) {
            exportBtn.innerHTML = `<span class="material-symbols-outlined text-base">download</span> Exportar (${selectedCount})`;
            exportBtn.classList.add('bg-indigo-100', 'text-indigo-700');
        } else {
            exportBtn.innerHTML = `<span class="material-symbols-outlined text-base">download</span> Exportar`;
            exportBtn.classList.remove('bg-indigo-100', 'text-indigo-700');
        }

        const allVisibleCheckboxes = document.querySelectorAll('#clientsList .client-checkbox');
        selectAllCheckbox.checked = allVisibleCheckboxes.length > 0 && selectedCount === allVisibleCheckboxes.length;
        selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < allVisibleCheckboxes.length;
    },

    updateClientActions() {
        const actionsBar = document.getElementById('clientsActionsBar');
        const countEl = document.getElementById('selectedClientsCount');
        const selectAllCheckbox = document.getElementById('selectAllClientsCheckbox');
        if (!actionsBar || !countEl || !selectAllCheckbox) return;

        const selectedCount = this.state.selectedClients.length;

        if (selectedCount > 0) {
            countEl.textContent = selectedCount;
            actionsBar.classList.remove('hidden');
        } else {
            actionsBar.classList.add('hidden');
        }

        const allVisibleCheckboxes = document.querySelectorAll('#clientsList .client-checkbox');
        selectAllCheckbox.checked = allVisibleCheckboxes.length > 0 && selectedCount === allVisibleCheckboxes.length;
        selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < allVisibleCheckboxes.length;
    },

    deleteSelectedClients() {
        const selectedIds = this.state.selectedClients;
        if (selectedIds.length === 0) return;

        UI.openConfirmationModal('Apagar Clientes', `Tem certeza que deseja apagar ${selectedIds.length} cliente(s)? Todos os dados de vendas e recebimentos associados a eles serão permanentemente removidos.`, async () => { // UI.showToast
            try {
                for (const clientId of selectedIds) {
                    await DBService.deleteClientAndRelatedData(clientId);
                }
                this.state.selectedClients = [];
                UI.showToast(`${selectedIds.length} cliente(s) apagado(s) com sucesso.`); // UI.showToast
                this.updateClientActions();
            } catch (error) {
                console.error("Erro ao apagar clientes em lote:", error);
                this.showToast("Ocorreu um erro ao apagar os clientes.", "error");
            }
        });
    },

    renderRecebimentosPage() {
        document.getElementById('recebimentosSearch').addEventListener('input', (e) => this.renderFilteredInstallmentsList(e.target.value));
        document.getElementById('toggleRecebimentosFiltersBtn').addEventListener('click', () => {
            document.getElementById('recebimentosFiltersPanel').classList.toggle('hidden');
        });
        document.getElementById('deleteSelectedInstallmentsBtn').addEventListener('click', () => this.deleteSelectedInstallments());
        document.getElementById('markSelectedAsPaidBtn').addEventListener('click', () => this.markSelectedInstallmentsAsPaid());
        document.getElementById('exportRecebimentosBtn').addEventListener('click', () => this.exportRecebimentosData());
        document.getElementById('clearRecebimentosFiltersBtn').addEventListener('click', () => this.clearRecebimentosFilters());

        const recebimentosView = document.getElementById('recebimentosView');
        recebimentosView.addEventListener('change', (e) => {
            if (e.target.matches('.installment-checkbox')) {
                const installmentId = e.target.dataset.id;
                if (e.target.checked) {
                    if (!this.state.selectedInstallments.includes(installmentId)) {
                        this.state.selectedInstallments.push(installmentId);
                    }
                } else {
                    this.state.selectedInstallments = this.state.selectedInstallments.filter(id => id !== installmentId);
                }
                this.updateRecebimentosActions();
            }

            if (e.target.matches('#selectAllInstallmentsCheckbox')) {
                const checkboxes = recebimentosView.querySelectorAll('.installment-checkbox');
                const pendingCheckboxes = Array.from(checkboxes).filter(cb => !cb.disabled);

                if (e.target.checked) {
                    this.state.selectedInstallments = pendingCheckboxes.map(cb => cb.dataset.id);
                    pendingCheckboxes.forEach(cb => cb.checked = true);
                } else {
                    this.state.selectedInstallments = [];
                    pendingCheckboxes.forEach(cb => cb.checked = false);
                }
                this.updateRecebimentosActions();
            }
        });

        this.renderFilteredInstallmentsList();
    },

    _getFilteredInstallments(searchTerm = '') {
        const listEl = document.getElementById('filteredInstallmentsList');
        if (!listEl) return [];

        // Setup filters
        const clientFilterSelect = document.getElementById('recebimentosFilterClient');
        const currentClientFilter = clientFilterSelect.value;
        clientFilterSelect.innerHTML = '<option value="all">Todos</option>';
        this.state.clients.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
            clientFilterSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
        clientFilterSelect.value = currentClientFilter;

        const statusFilter = document.getElementById('recebimentosFilterStatus');
        const dateFilter = document.getElementById('recebimentosFilterDate');

        // Apply filters
        let installmentsToRender = [...this.state.installments];
        const status = statusFilter.value;
        const clientId = clientFilterSelect.value;
        const dateOption = dateFilter.value;
        const lowerSearchTerm = searchTerm.toLowerCase();

        const today = new Date(); today.setHours(0, 0, 0, 0);

        if (status !== 'all') {
            switch (status) {
                case 'pending': installmentsToRender = installmentsToRender.filter(i => i.status === 'pending' && this.safeParseDate(i.dueDate) >= today); break;
                case 'overdue': installmentsToRender = installmentsToRender.filter(i => i.status === 'pending' && this.safeParseDate(i.dueDate) < today); break;
                case 'paid': installmentsToRender = installmentsToRender.filter(i => i.status === 'paid'); break;
            }
        }

        if (clientId !== 'all') {
            installmentsToRender = installmentsToRender.filter(i => i.clientId === clientId);
        }

        if (dateOption !== 'all') {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();

            if (dateOption === 'this_month') {
                installmentsToRender = installmentsToRender.filter(i => {
                    const d = this.safeParseDate(i.dueDate);
                    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
                });
            } else if (dateOption === 'last_month') {
                const lastMonth = new Date(currentYear, currentMonth - 1, 1);
                installmentsToRender = installmentsToRender.filter(i => {
                    const d = this.safeParseDate(i.dueDate);
                    return d.getFullYear() === lastMonth.getFullYear() && d.getMonth() === lastMonth.getMonth();
                });
            } else if (dateOption === 'next_30_days') {
                const limitDate = new Date(); limitDate.setDate(now.getDate() + 30);
                installmentsToRender = installmentsToRender.filter(i => {
                    const d = this.safeParseDate(i.dueDate);
                    return d >= today && d <= limitDate;
                });
            }
        }

        if (lowerSearchTerm) {
            installmentsToRender = installmentsToRender.filter(inst => {
                const client = this.state.clients.find(c => c.id === inst.clientId);
                return client?.name.toLowerCase().includes(lowerSearchTerm);
            });
        }

        return installmentsToRender;
    },

    renderFilteredInstallmentsList(searchTerm = '') {
        const listEl = document.getElementById('filteredInstallmentsList');
        if (!listEl) return;

        // Setup change listeners
        ['recebimentosFilterStatus', 'recebimentosFilterClient', 'recebimentosFilterDate'].forEach(id => {
            const el = document.getElementById(id);
            if (el && !el.onchange) { // Attach listener only once
                el.onchange = () => this.renderFilteredInstallmentsList(document.getElementById('recebimentosSearch').value);
            }
        });

        const installmentsToRender = this._getFilteredInstallments(searchTerm);
        // Define today here for use in rendering logic
        const today = new Date(); today.setHours(0, 0, 0, 0);

        this.updateRecebimentosFilterBadge();

        installmentsToRender.sort((a, b) => this.safeParseDate(b.dueDate) - this.safeParseDate(a.dueDate));

        listEl.innerHTML = '';
        if (installmentsToRender.length === 0) {
            listEl.innerHTML = `<div class="text-center py-16"><span class="material-symbols-outlined text-slate-400 text-5xl">search_off</span><h3 class="mt-2 text-sm font-semibold text-slate-900">Nenhum recebimento encontrado</h3><p class="mt-1 text-sm text-slate-500">Tente ajustar os filtros ou adicione uma nova venda.</p></div>`;
            return;
        }
        installmentsToRender.forEach(inst => {
            const client = this.state.clients.find(c => c.id === inst.clientId), sale = this.state.sales.find(s => s.id === inst.saleId);
            // client and sale are guaranteed to exist here due to initial filtering in _getFilteredInstallments
            const isChecked = this.state.selectedInstallments.includes(inst.id);
            const isPaid = inst.status === 'paid';
            const dueDate = this.safeParseDate(inst.dueDate), isOverdue = inst.status === 'pending' && dueDate < today;
            let statusBadge;
            if (inst.status === 'paid') { statusBadge = `<span class="text-xs font-semibold text-green-800 bg-green-100 px-2.5 py-1 rounded-full">Pago em ${this.safeParseDate(inst.paidDate).toLocaleDateString('pt-BR')}</span>`; }
            else if (isOverdue) { statusBadge = `<span class="text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1 rounded-full">Vencido</span>`; }
            else { statusBadge = `<span class="text-xs font-semibold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full">Em Aberto</span>`; }

            const markPaidButtonDesktop = inst.status === 'pending'
                ? `<button data-id="${inst.id}" title="Marcar como Recebido" class="mark-paid-btn text-slate-400 hover:text-green-600 p-1 rounded-full transition-colors"><span class="material-symbols-outlined">check_circle</span></button>`
                : '';

            const markPaidButtonMobile = inst.status === 'pending'
                ? `<button data-id="${inst.id}" class="mark-paid-btn bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-semibold text-sm hover:bg-green-200 transition-colors">Recebido</button>`
                : '';

            const item = document.createElement('div');
            item.className = `bg-white md:bg-transparent rounded-xl md:rounded-none shadow-sm md:shadow-none border md:border-0 md:border-b border-slate-200 mb-3 md:mb-0 md:grid md:grid-cols-12 md:gap-x-4 md:items-center transition-all duration-200 hover:shadow-md ${isChecked ? 'bg-indigo-50' : (inst.status === 'paid' ? 'bg-slate-50' : (isOverdue ? 'bg-red-50' : 'bg-white'))}`;

            item.innerHTML = `
                        <div class="p-4 md:hidden">
                            <div class="flex justify-between items-start">
                                <div class="flex items-start gap-3">
                                    <div class="flex-shrink-0 pt-1">
                                        <input type="checkbox" data-id="${inst.id}" class="installment-checkbox h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" ${isChecked ? 'checked' : ''} ${isPaid ? 'disabled' : ''}>
                                    </div>
                                    <p class="font-semibold text-slate-800 truncate">${client.name}</p>
                                    <p class="text-sm text-slate-500 truncate">${sale.description} - ${inst.installmentNumber}/${inst.totalInstallments}</p>
                                </div>
                                <p class="font-semibold text-slate-900">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}</p>
                            </div>
                            <div class="flex justify-between items-end mt-4">
                                <div>
                                    ${statusBadge}
                                    <p class="text-xs text-slate-500 mt-1">Venc. ${dueDate.toLocaleDateString('pt-BR')}</p>
                                </div>
                                ${markPaidButtonMobile}
                            </div>
                        </div>
                        <div class="hidden md:contents">
                            <div class="md:col-span-1 flex items-center justify-center p-4">
                                <input type="checkbox" data-id="${inst.id}" class="installment-checkbox h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed" ${isChecked ? 'checked' : ''} ${isPaid ? 'disabled' : ''}>
                            </div>
                            <div class="md:col-span-4 flex items-center p-4">
                                <div class="flex-grow">
                                    <p class="font-semibold text-slate-800 truncate">${client.name}</p>
                                    <p class="text-sm text-slate-500 truncate">${sale.description} - ${inst.installmentNumber}/${inst.totalInstallments}</p>
                                </div>
                            </div>
                            <div class="md:col-span-3 text-right p-4">
                                <p class="font-semibold text-slate-900">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}</p>
                            </div>
                            <div class="md:col-span-4 text-right flex items-center justify-end gap-2 p-4">
                                <div>
                                    ${statusBadge}
                                    <p class="text-xs text-slate-500 mt-1">Venc. ${dueDate.toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div class="flex items-center">
                                    ${markPaidButtonDesktop}
                                    <button data-id="${inst.id}" title="Apagar Parcela" class="delete-installment-btn text-slate-400 hover:text-red-500 p-1 rounded-full transition-colors"><span class="material-symbols-outlined">delete</span></button>
                                </div>
                            </div>
                        </div>
                    `;
            listEl.appendChild(item);
        });
        this.updateRecebimentosActions();
    },

    clearRecebimentosFilters() {
        document.getElementById('recebimentosSearch').value = '';
        document.getElementById('recebimentosFilterStatus').value = 'all';
        document.getElementById('recebimentosFilterClient').value = 'all';
        document.getElementById('recebimentosFilterDate').value = 'all';
        this.renderFilteredInstallmentsList();
    },

    updateRecebimentosFilterBadge() {
        const status = document.getElementById('recebimentosFilterStatus').value;
        const client = document.getElementById('recebimentosFilterClient').value;
        const date = document.getElementById('recebimentosFilterDate').value;
        const badge = document.getElementById('recebimentosFilterBadge');

        if (status !== 'all' || client !== 'all' || date !== 'all') {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    updateRecebimentosActions() {
        const actionsBar = document.getElementById('recebimentosActionsBar');
        const countEl = document.getElementById('selectedInstallmentsCount');
        const selectAllCheckbox = document.getElementById('selectAllInstallmentsCheckbox');
        if (!actionsBar || !countEl || !selectAllCheckbox) return;

        const selectedCount = this.state.selectedInstallments.length;

        if (selectedCount > 0) {
            countEl.textContent = selectedCount;
            actionsBar.classList.remove('hidden');
        } else {
            actionsBar.classList.add('hidden');
        }

        const allVisibleCheckboxes = document.querySelectorAll('#filteredInstallmentsList .installment-checkbox');
        const allVisiblePendingCheckboxes = Array.from(allVisibleCheckboxes).filter(cb => !cb.disabled);

        selectAllCheckbox.checked = allVisiblePendingCheckboxes.length > 0 && selectedCount === allVisiblePendingCheckboxes.length;
        selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < allVisiblePendingCheckboxes.length;
    },

    markSelectedInstallmentsAsPaid() {
        const pendingIdsToMark = this.state.selectedInstallments.filter(id => {
            const installment = this.state.installments.find(i => i.id === id);
            return installment && installment.status === 'pending';
        });

        if (pendingIdsToMark.length === 0) return;

        UI.openConfirmationModal('Confirmar Pagamento', `Tem certeza que deseja marcar ${pendingIdsToMark.length} recebimento(s) como pago(s)?`, async () => { // UI.showToast
            const batch = writeBatch(db); // UI.showToast
            const paidDate = new Date().toISOString().split('T')[0];

            pendingIdsToMark.forEach(id => {
                const docRef = doc(db, DBService._getCollectionPath('installments'), id);
                batch.update(docRef, { status: 'paid', paidDate: paidDate });
            });

            await batch.commit();
            this.state.selectedInstallments = [];
            this.showToast(`${pendingIdsToMark.length} recebimento(s) marcado(s) como pago(s).`);
            this.updateRecebimentosActions();
        }, false);
    },

    deleteSelectedInstallments() {
        const selectedIds = this.state.selectedInstallments;
        if (selectedIds.length === 0) return;

        UI.openConfirmationModal('Apagar Recebimentos', `Tem certeza que deseja apagar ${selectedIds.length} recebimento(s)? Esta ação não pode ser desfeita.`, async () => { // UI.showToast
            const batch = writeBatch(db); // UI.showToast
            selectedIds.forEach(id => batch.delete(doc(db, DBService._getCollectionPath('installments'), id)));
            await batch.commit();
            this.state.selectedInstallments = [];
            UI.showToast(`${selectedIds.length} recebimento(s) apagado(s) com sucesso.`); // UI.showToast
            this.updateRecebimentosActions();
        }); // UI.showToast
    },

    exportRecebimentosData() {
        const searchTerm = document.getElementById('recebimentosSearch').value;
        const installmentsToExport = this._getFilteredInstallments(searchTerm);

        if (installmentsToExport.length === 0) {
            UI.showToast("Nenhum recebimento para exportar com os filtros atuais.", "error"); // UI.showToast
            return;
        }

        const today = new Date(); today.setHours(0, 0, 0, 0);

        const dataToExport = installmentsToExport.map(inst => {
            const client = this.state.clients.find(c => c.id === inst.clientId);
            const sale = this.state.sales.find(s => s.id === inst.saleId);
            const dueDate = this.safeParseDate(inst.dueDate);
            const isOverdue = inst.status === 'pending' && dueDate < today;

            let statusText = 'Em Aberto';
            if (inst.status === 'paid') {
                statusText = `Pago (${this.safeParseDate(inst.paidDate).toLocaleDateString('pt-BR')})`;
            } else if (isOverdue) {
                statusText = 'Vencido';
            }

            return {
                'Cliente': client?.name || 'N/A',
                'Descrição da Venda': sale?.description || 'N/A',
                'Parcela': `${inst.installmentNumber}/${inst.totalInstallments}`,
                'Valor': inst.value,
                'Data de Vencimento': dueDate.toLocaleDateString('pt-BR'),
                'Status': statusText
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        // Format value column as currency
        worksheet['!cols'] = [{ wch: 25 }, { wch: 30 }, { wch: 10 }, { wch: 15, z: '"R$"#,##0.00' }, { wch: 20 }, { wch: 20 }];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Recebimentos");

        XLSX.writeFile(workbook, "Relatorio_Recebimentos_ATLAS.xlsx");
    },

    renderDespesasPage() {
        document.getElementById('despesasSearch').addEventListener('input', (e) => this.renderDespesasList(e.target.value));
        document.getElementById('deleteSelectedDespesasBtn').addEventListener('click', () => this.deleteSelectedDespesas());

        const despesasView = document.getElementById('despesasView');

        document.getElementById('addExpenseBtn').addEventListener('click', () => {
            const addExpenseModal = document.getElementById('addExpenseModal');
            const form = addExpenseModal.querySelector('form');
            if (form) form.reset(); // UI.openModal

            const categories = [...new Set(this.state.despesas.map(d => d.category))];
            const datalist = addExpenseModal.querySelector('#expenseCategoriesList');
            if (datalist) {
                datalist.innerHTML = categories.map(c => `<option value="${c}"></option>`).join('');
            }
            UI.openModal(addExpenseModal);
        });

        despesasView.addEventListener('change', (e) => {
            if (e.target.matches('.despesa-checkbox')) {
                const despesaId = e.target.dataset.id;
                if (e.target.checked) {
                    if (!this.state.selectedDespesas.includes(despesaId)) {
                        this.state.selectedDespesas.push(despesaId);
                    }
                } else {
                    this.state.selectedDespesas = this.state.selectedDespesas.filter(id => id !== despesaId);
                }
                this.updateDespesasActions();
            }
            if (e.target.matches('#selectAllDespesasCheckbox')) {
                const checkboxes = despesasView.querySelectorAll('.despesa-checkbox');
                this.state.selectedDespesas = e.target.checked ? Array.from(checkboxes).map(cb => cb.dataset.id) : [];
                checkboxes.forEach(cb => cb.checked = e.target.checked);
                this.updateDespesasActions();
            }
        });

        this.renderDespesasList();
    },

    renderSettingsPage() {
        const user = AuthService.currentUser;
        const form = document.getElementById('settingsForm');
        form.settingsName.value = user.name || user.displayName;
        form.settingsEmail.value = user.email;

        if (user.address) {
            form.settingsCep.value = user.address.cep || '';
            form.settingsStreet.value = user.address.street || '';
            form.settingsNumber.value = user.address.number || '';
            form.settingsNeighborhood.value = user.address.neighborhood || '';
            form.settingsCity.value = user.address.city || '';
            form.settingsState.value = user.address.state || '';
        }

        document.getElementById('searchCepBtn').addEventListener('click', async () => {
            const cep = form.settingsCep.value.replace(/\D/g, '');
            if (cep.length !== 8) return;
            try {
                const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await response.json();
                if (!data.erro) {
                    form.settingsStreet.value = data.logradouro;
                    form.settingsNeighborhood.value = data.bairro;
                    form.settingsCity.value = data.localidade;
                    form.settingsState.value = data.uf;
                }
            } catch (error) {
                        UI.showToast("Não foi possível buscar o CEP.", "error");
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            UI.setButtonLoading(submitBtn, true, 'A gravar...');
            try {
                const updatedUser = {
                    name: form.settingsName.value,
                    address: {
                        cep: form.settingsCep.value,
                        street: form.settingsStreet.value,
                        number: form.settingsNumber.value,
                        neighborhood: form.settingsNeighborhood.value,
                        city: form.settingsCity.value,
                        state: form.settingsState.value,
                    }
                };
                await AuthService.updateUser(updatedUser);
                this.renderUserProfile();
                UI.showToast("Perfil atualizado com sucesso!");
            } catch (error) {
                UI.showToast("Erro ao atualizar o perfil.", "error");
            } finally {
                UI.setButtonLoading(submitBtn, false, 'Gravar Alterações');
            }
        });
    },

    renderClientsList(searchTerm = '') {
        const listEl = document.getElementById('clientsList');
        if (!listEl) return;

        listEl.innerHTML = '';

        this.state.clients.forEach(c => {
            const clientSales = this.state.sales.filter(s => s.clientId === c.id);
            c.totalFaturado = clientSales.reduce((sum, sale) => sum + sale.totalValue, 0);

            const clientInstallments = this.state.installments.filter(i => i.clientId === c.id);
            const totalPago = clientInstallments.filter(i => i.status === 'paid').reduce((sum, inst) => sum + inst.value, 0);
            c.saldoDevedor = c.totalFaturado - totalPago;

            c.hasOverdue = clientInstallments.some(i => i.status === 'pending' && this.safeParseDate(i.dueDate) < new Date());
        });

        const filteredClients = this.state.clients
            .filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

        const { key, direction } = this.state.clientSort;
        filteredClients.sort((a, b) => {
            let valA = a[key];
            let valB = b[key];

            if (key === 'createdAt') {
                valA = this.safeParseDate(a.createdAt);
                valB = this.safeParseDate(b.createdAt);
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        document.querySelectorAll('[data-sort] .sort-icon').forEach(icon => {
            icon.textContent = 'unfold_more';
            icon.parentElement.classList.remove('text-indigo-700');
        });
        const activeSorter = document.querySelector(`[data-sort="${key}"]`);
        if (activeSorter) {
            activeSorter.classList.add('text-indigo-700');
            activeSorter.querySelector('.sort-icon').textContent = direction === 'desc' ? 'arrow_downward' : 'arrow_upward';
        }

        if (filteredClients.length === 0) {
            listEl.innerHTML = `<div class="text-center py-16"><span class="material-symbols-outlined text-slate-400 text-5xl">groups</span><h3 class="mt-2 text-sm font-semibold text-slate-900">Nenhum cliente encontrado</h3><p class="mt-1 text-sm text-slate-500">${searchTerm ? 'Tente um termo de busca diferente.' : 'Comece adicionando seu primeiro cliente.'}</p><div class="mt-6"><button type="button" id="addClientFromEmptyState" class="inline-flex items-center rounded-md bg-indigo-700 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800"><span class="material-symbols-outlined -ml-0.5 mr-1.5">add</span>Novo Cliente</button></div></div>`;
            return;
        }

        filteredClients.forEach(c => {
            const initials = c.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const isChecked = this.state.selectedClients.includes(c.id);
            const item = document.createElement('div');
            item.className = `relative client-item-clickable bg-white md:bg-transparent rounded-xl shadow-sm md:shadow-none border border-slate-200 md:border-0 mb-3 md:mb-0 md:hover:bg-slate-50 transition-colors cursor-pointer ${isChecked ? 'bg-indigo-50/50' : ''}`;
            item.dataset.clientId = c.id;

            item.innerHTML = `
                        <div class="p-4 md:hidden">
                            <div class="flex items-start">
                                <div class="flex-shrink-0 pt-1">
                                    <input type="checkbox" data-id="${c.id}" class="client-checkbox h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500" onclick="event.stopPropagation()" ${isChecked ? 'checked' : ''}>
                                </div>
                                <div class="flex-grow flex items-center gap-3 ml-3">
                                    <div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">${initials}</div>
                                    <div class="flex-grow min-w-0">
                                        <p class="font-semibold text-slate-800 truncate">${c.name}</p>
                                        <p class="text-xs text-slate-500 truncate">${c.email || 'Sem email'}</p>
                                    </div>
                                </div>
                                <div class="absolute top-2 right-2">
                                    <button data-id="${c.id}" class="client-actions-btn text-slate-500 hover:text-slate-800 p-1 rounded-full"><span class="material-symbols-outlined">more_vert</span></button>
                                </div>
                            </div>
                            <div class="mt-4 pt-3 border-t border-slate-200 flex justify-between text-sm">
                                <div>
                                    <p class="text-xs text-slate-400 font-medium">CONTACTO</p>
                                    <p class="text-slate-600">${c.contact || 'N/A'}</p>
                                </div>
                                <div class="text-right ${c.saldoDevedor > 0 ? (c.hasOverdue ? 'text-red-600' : 'text-blue-600') : 'text-green-600'}">
                                    <p class="text-xs text-slate-400 font-medium">SALDO DEVEDOR</p>
                                    <p class="font-bold">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.saldoDevedor)}</p>
                                </div>
                            </div>
                        </div>

                        <div class="hidden md:grid md:grid-cols-12 md:gap-4 items-center px-4 py-3 border-b border-slate-200">
                            <div class="col-span-1 flex items-center justify-center">
                                <input type="checkbox" data-id="${c.id}" class="client-checkbox h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500" onclick="event.stopPropagation()" ${isChecked ? 'checked' : ''}>
                            </div>
                            <div class="col-span-3 flex items-center gap-3">
                                <div class="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">${initials}</div>
                                <div class="min-w-0">
                                    <p class="font-semibold text-slate-800 truncate">${c.name}</p>
                                    <p class="text-xs text-slate-500 truncate">${c.email || 'Sem email'}</p>
                                </div>
                            </div>
                            <div class="col-span-2 text-slate-600 truncate text-sm">${c.contact || 'N/A'}</div>
                            <div class="col-span-3 text-right font-medium text-slate-700">
                                ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.totalFaturado)}
                            </div>
                            <div class="col-span-2 text-right font-bold ${c.saldoDevedor > 0 ? (c.hasOverdue ? 'text-red-600' : 'text-blue-600') : 'text-green-600'}">
                                ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c.saldoDevedor)}
                                ${c.hasOverdue ? '<span class="material-symbols-outlined text-sm ml-1" title="Possui pendências vencidas">warning</span>' : ''}
                            </div>
                            <div class="col-span-1 text-right">
                                <button data-id="${c.id}" class="client-actions-btn text-slate-500 hover:text-slate-800 p-1 rounded-full"><span class="material-symbols-outlined">more_vert</span></button>
                            </div>
                        </div>

                        <div id="actions-menu-${c.id}" class="absolute right-4 top-12 md:right-6 md:top-14 w-48 bg-white rounded-md shadow-lg py-1 hidden z-10 ring-1 ring-black ring-opacity-5">
                            <button data-id="${c.id}" class="view-client-report-btn flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 text-left">
                                <span class="material-symbols-outlined text-base mr-2">assessment</span> Ver Relatório
                            </button>
                            <div class="my-1 h-px bg-slate-100"></div>
                            <button data-id="${c.id}" class="edit-client-btn flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 text-left">
                                <span class="material-symbols-outlined text-base mr-2">edit</span> Editar
                            </button>
                            <button data-id="${c.id}" class="delete-client-btn flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-slate-100 text-left">
                                <span class="material-symbols-outlined text-base mr-2">delete</span> Excluir
                            </button>
                        </div>
                    `;
            listEl.appendChild(item);
        });
        this.updateClientActions();
    },

    renderDespesasList(searchTerm = '') {
        const listEl = document.getElementById('despesasList');
        if (!listEl) return;

        listEl.innerHTML = '';
        const filteredDespesas = this.state.despesas
            .filter(d => d.description.toLowerCase().includes(searchTerm.toLowerCase()) || d.category.toLowerCase().includes(searchTerm.toLowerCase()))
            .sort((a, b) => this.safeParseDate(b.date) - this.safeParseDate(a.date));

        if (filteredDespesas.length === 0) {
            listEl.innerHTML = `<div class="text-center py-16"><span class="material-symbols-outlined text-slate-400 text-5xl">receipt</span><h3 class="mt-2 text-sm font-semibold text-slate-900">Nenhuma despesa encontrada</h3><p class="mt-1 text-sm text-slate-500">${searchTerm ? 'Tente um termo de busca diferente.' : 'Comece adicionando sua primeira despesa.'}</p></div>`;
            return;
        }

        filteredDespesas.forEach(d => {
            const isChecked = this.state.selectedDespesas.includes(d.id);
            const item = document.createElement('div');
            item.className = `bg-white rounded-xl shadow-sm mb-3 border border-slate-200 p-4 md:grid md:grid-cols-12 md:gap-4 md:items-center md:bg-transparent md:shadow-none md:border-0 md:border-b md:rounded-none md:mb-0 md:p-0 md:px-4 md:py-3 hover:bg-slate-50 transition-colors ${isChecked ? 'bg-indigo-50/50' : ''}`;

            item.innerHTML = `
                        <div class="md:hidden">
                            <div class="flex justify-between items-start">
                                <div class="flex items-start gap-3">
                                    <div class="flex-shrink-0 pt-1">
                                        <input type="checkbox" data-id="${d.id}" class="despesa-checkbox h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500" ${isChecked ? 'checked' : ''}>
                                    </div>
                                    <p class="font-medium text-slate-800">${d.description}</p>
                                    <p class="text-sm text-slate-500">${this.safeParseDate(d.date).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <p class="font-semibold text-red-500">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.value)}</p>
                            </div>
                             <div class="flex justify-between items-end mt-2">
                                <span class="bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full text-xs ml-7">${d.category}</span>
                                <button data-id="${d.id}" class="delete-expense-btn text-slate-400 hover:text-red-500 p-1 -mr-1 rounded-full"><span class="material-symbols-outlined">delete</span></button>
                            </div>
                        </div>

                        <div class="hidden md:contents">
                            <div class="md:col-span-1 flex items-center justify-center"><input type="checkbox" data-id="${d.id}" class="despesa-checkbox h-4 w-4 rounded border-slate-300 text-indigo-700 focus:ring-indigo-500" ${isChecked ? 'checked' : ''}></div>
                            <div class="md:col-span-3 text-slate-800 font-medium">${d.description}</div>
                            <div class="md:col-span-3 text-slate-600 text-sm"><span class="bg-slate-200 text-slate-700 px-2.5 py-1 rounded-full text-xs">${d.category}</span></div>
                            <div class="md:col-span-2 text-slate-600 text-sm">${this.safeParseDate(d.date).toLocaleDateString('pt-BR')}</div>
                            <div class="md:col-span-2 text-right text-red-500 font-semibold">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(d.value)}</div>
                            <div class="md:col-span-1 text-right relative">
                                <button data-id="${d.id}" class="delete-expense-btn text-slate-500 hover:text-red-500 p-1 rounded-full"><span class="material-symbols-outlined">delete</span></button>
                            </div>
                        </div>
                    `;
            listEl.appendChild(item);
        });
        this.updateDespesasActions();
    },

    updateDespesasActions() {
        const actionsBar = document.getElementById('despesasActionsBar');
        const countEl = document.getElementById('selectedDespesasCount');
        const selectAllCheckbox = document.getElementById('selectAllDespesasCheckbox');
        if (!actionsBar || !countEl || !selectAllCheckbox) return;

        const selectedCount = this.state.selectedDespesas.length;

        if (selectedCount > 0) {
            countEl.textContent = selectedCount;
            actionsBar.classList.remove('hidden');
        } else {
            actionsBar.classList.add('hidden');
        }

        const allVisibleCheckboxes = document.querySelectorAll('#despesasList .despesa-checkbox');
        selectAllCheckbox.checked = allVisibleCheckboxes.length > 0 && selectedCount === allVisibleCheckboxes.length;
        selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < allVisibleCheckboxes.length;
    },

    deleteSelectedDespesas() {
        const selectedIds = this.state.selectedDespesas;
        if (selectedIds.length === 0) return;

        this.openConfirmationModal('Apagar Despesas', `Tem certeza que deseja apagar ${selectedIds.length} despesa(s)?`, async () => {
            const batch = writeBatch(db); // UI.showToast
            selectedIds.forEach(id => batch.delete(doc(db, DBService._getCollectionPath('despesas'), id)));
            await batch.commit();
            this.state.selectedDespesas = [];
            UI.showToast(`${selectedIds.length} despesa(s) apagada(s) com sucesso.`); // UI.showToast
            this.updateDespesasActions();
        });
    },

    // =================================================================
    // EVENT LISTENERS & FORM HANDLERS
    // =================================================================
    setupGlobalEventListeners() {
        document.body.addEventListener('click', (e) => { // UI.closeModal
            const closeModalBtn = e.target.closest('.close-modal-btn, .cancel-modal-btn');
            if (closeModalBtn) UI.closeModal(closeModalBtn.closest('.modal'));
        });

        const addClientModal = document.getElementById('addClientModal');
        const editClientModal = document.getElementById('editClientModal');
        const addSaleModal = document.getElementById('addSaleModal');
        const addExpenseModal = document.getElementById('addExpenseModal');
        const addClientForm = document.getElementById('addClientForm');
        const editClientForm = document.getElementById('editClientForm');
        const addExpenseForm = document.getElementById('addExpenseForm');

        const handlePhoneInput = (e) => { let v = e.target.value.replace(/\D/g, ''); v = v.replace(/^(\d{2})(\d)/g, '($1) $2'); v = v.replace(/(\d{5})(\d)/, '$1-$2'); e.target.value = v; };

        addClientModal.querySelector('#clientContact').addEventListener('input', handlePhoneInput);
        editClientModal.querySelector('#editClientContact').addEventListener('input', handlePhoneInput);

        const addSaleForm = document.getElementById('addSaleForm');
        const singlePaymentFields = document.getElementById('singlePaymentFields');
        const installmentsFields = document.getElementById('installmentsFields');

        addSaleForm.querySelectorAll('input[name="paymentType"]').forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'installments') {
                    singlePaymentFields.classList.add('hidden');
                    installmentsFields.classList.remove('hidden');
                } else {
                    installmentsFields.classList.add('hidden');
                    singlePaymentFields.classList.remove('hidden');
                }
            });
        });

        const fabContainer = document.getElementById('fab-container');
        const fabToggle = document.getElementById('fab-toggle');
        const fabMenu = document.getElementById('fab-menu');
        const fabIconPlus = document.getElementById('fab-icon-plus');
        const fabIconClose = document.getElementById('fab-icon-close');

        const closeFabMenu = () => {
            fabMenu.classList.add('opacity-0', 'pointer-events-none', '-translate-y-2');
            fabToggle.classList.remove('rotate-45');
            fabIconPlus.classList.remove('scale-0');
            fabIconClose.classList.add('scale-0');
        };

        fabToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            fabMenu.classList.toggle('opacity-0');
            fabMenu.classList.toggle('pointer-events-none');
            fabMenu.classList.toggle('-translate-y-2');
            fabToggle.classList.toggle('rotate-45');
            fabIconPlus.classList.toggle('scale-0');
            fabIconClose.classList.toggle('scale-0');
        });

        document.getElementById('fab-new-client').addEventListener('click', () => {
            const form = addClientModal.querySelector('form');
            if (form) form.reset();
            UI.openModal(addClientModal);
            closeFabMenu();
        });

        document.getElementById('fab-new-sale').addEventListener('click', () => {
            const form = addSaleModal.querySelector('form');
            if (form) form.reset();

            const select = document.getElementById('clientSelect');
            select.innerHTML = '<option value="">Selecione um cliente</option>';
            this.state.clients.forEach(c => select.innerHTML += `<option value="${c.id}">${c.name}</option>`); // UI.openModal
            this.openModal(addSaleModal);
            closeFabMenu();
        });

        document.getElementById('fab-new-expense').addEventListener('click', () => {
            const form = addExpenseModal.querySelector('form');
            if (form) form.reset();

            const categories = [...new Set(this.state.despesas.map(d => d.category))];
            const datalist = addExpenseModal.querySelector('#expenseCategoriesList');
            if (datalist) {
                datalist.innerHTML = categories.map(c => `<option value="${c}"></option>`).join('');
            }
            UI.openModal(addExpenseModal);
            closeFabMenu();
        });

        document.getElementById('mainContent').addEventListener('click', (e) => {
            // Open Client Detail Modal
            const clientItem = e.target.closest('.client-item-clickable');
            if (clientItem && !e.target.closest('.client-checkbox, .client-actions-btn, [id^="actions-menu-"]')) {
                this.navigateTo('clientDetail', false, clientItem.dataset.clientId);
            }

            const clientActionsBtn = e.target.closest('.client-actions-btn, .orcamento-actions-btn');
            if (clientActionsBtn) {
                e.stopPropagation();
                const menuId = `actions-menu-${clientActionsBtn.dataset.id}`;
                const targetMenu = document.getElementById(menuId);
                const isHidden = targetMenu.classList.contains('hidden');
                document.querySelectorAll('[id^="actions-menu-"]').forEach(m => {
                    if (m.id !== menuId) m.classList.add('hidden');
                });

                if (isHidden) {
                    targetMenu.classList.remove('hidden');
                    const rect = clientActionsBtn.getBoundingClientRect();
                    if (window.innerHeight - rect.bottom < 220) {
                        targetMenu.style.bottom = '100%';
                        targetMenu.style.top = 'auto';
                    } else {
                        targetMenu.style.top = '100%';
                        targetMenu.style.bottom = 'auto';
                    }
                } else {
                    targetMenu.classList.add('hidden');
                }
            }

            const viewClientReportBtn = e.target.closest('.view-client-report-btn');
            if (viewClientReportBtn) {
                this.navigateTo('clientDetail', false, viewClientReportBtn.dataset.id);
            }

            const markPaidBtn = e.target.closest('.mark-paid-btn');
            if (markPaidBtn) {
                DBService.updateItem('installments', markPaidBtn.dataset.id, {
                    status: 'paid',
                    paidDate: new Date().toISOString().split('T')[0]
                });
            }

            const editClientBtn = e.target.closest('.edit-client-btn');
            if (editClientBtn) {
                const c = this.state.clients.find(cl => cl.id === editClientBtn.dataset.id);
                if (c) {
                    editClientModal.querySelector('#editClientId').value = c.id;
                    editClientModal.querySelector('#editClientName').value = c.name;
                    editClientModal.querySelector('#editClientContact').value = c.contact || '';
                    editClientModal.querySelector('#editClientEmail').value = c.email || '';
                    UI.openModal(editClientModal);
                }
            }

            const deleteClientBtn = e.target.closest('.delete-client-btn');
            if (deleteClientBtn) {
                const id = deleteClientBtn.dataset.id;
                const c = this.state.clients.find(cl => cl.id === id);
                if (c) {
                    UI.openConfirmationModal('Apagar Cliente', `Tem certeza que deseja apagar "<strong>${c.name}</strong>"? Todas as vendas e recebimentos associados a ele também serão apagados.`, async () => {
                        try { // UI.showToast
                            await DBService.deleteClientAndRelatedData(id);
                            UI.showToast("Cliente e dados relacionados apagados.");
                        } catch (err) {
                            this.showToast("Erro ao apagar o cliente.", "error");
                        }
                    });
                }
            }

            const deleteInstallmentBtn = e.target.closest('.delete-installment-btn');
            if (deleteInstallmentBtn) {
                const id = deleteInstallmentBtn.dataset.id;
                if (id) {
                    UI.openConfirmationModal('Apagar Recebimento', 'Tem certeza que deseja apagar esta parcela?', () => { // UI.showToast
                        DBService.deleteItem('installments', id);
                    });
                }
            }
            const deleteExpenseBtn = e.target.closest('.delete-expense-btn');
            if (deleteExpenseBtn) {
                const id = deleteExpenseBtn.dataset.id;
                UI.openConfirmationModal('Apagar Despesa', 'Tem certeza que deseja apagar esta despesa?', () => {
                    DBService.deleteItem('despesas', id);
                });
            }

            if (e.target.closest('#addClientBtn') || e.target.closest('#addClientFromEmptyState')) {
                const form = addClientModal.querySelector('form');
                if (form) form.reset();
                UI.openModal(addClientModal);
            }

            if (e.target.closest('#addOrcamentoBtn')) { this.openOrcamentoModal(); }

            const viewOrcamentoBtn = e.target.closest('.view-orcamento-btn');
            if (viewOrcamentoBtn) {
                this.showOrcamentoPreview(viewOrcamentoBtn.dataset.id);
            }

            const downloadOrcamentoBtn = e.target.closest('.download-orcamento-btn');
            if (downloadOrcamentoBtn) {
                this.generatePdf(downloadOrcamentoBtn.dataset.id, downloadOrcamentoBtn);
            }

            const editOrcamentoBtn = e.target.closest('.edit-orcamento-btn');
            if (editOrcamentoBtn) {
                this.openOrcamentoModal(editOrcamentoBtn.dataset.id);
            }

            const convertOrcamentoBtn = e.target.closest('.convert-orcamento-btn');
            if (convertOrcamentoBtn) {
                this.convertOrcamentoToVenda(convertOrcamentoBtn.dataset.id);
            }

            const deleteOrcamentoBtn = e.target.closest('.delete-orcamento-btn');
            if (deleteOrcamentoBtn) {
                const id = deleteOrcamentoBtn.dataset.id;
                UI.openConfirmationModal('Apagar Orçamento', 'Tem certeza que deseja apagar este orçamento?', () => {
                    DBService.deleteItem('orcamentos', id).then(() => {
                        UI.showToast('Orçamento apagado com sucesso!');
                    }).catch(err => {
                        UI.showToast('Erro ao apagar orçamento.', 'error');
                    });
                });
            }

            const changeStatusBtn = e.target.closest('.change-status-orcamento-btn');
            if (changeStatusBtn) {
                const { id, status } = changeStatusBtn.dataset;
                DBService.updateItem('orcamentos', id, { status }).then(() => { // UI.showToast
                    UI.showToast(`Orçamento marcado como ${status}!`);
                }).catch(err => {
                    UI.showToast('Erro ao atualizar status.', 'error');
                });
            }

        });

        window.addEventListener('click', (e) => {
            if (!e.target.closest('.client-actions-btn, .orcamento-actions-btn') && !e.target.closest('[id^="actions-menu-"]')) {
                document.querySelectorAll('[id^="actions-menu-"]').forEach(menu => menu.classList.add('hidden'));
            }

            if (!fabContainer.contains(e.target)) {
                closeFabMenu();
            }

            const notificationPanel = document.getElementById('notification-panel');
            if (notificationPanel && !notificationPanel.classList.contains('hidden') && !notificationPanel.parentElement.contains(e.target)) {
                notificationPanel.classList.add('hidden');
            }
        });

        addSaleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            UI.setButtonLoading(submitBtn, true); // UI.setButtonLoading
 // UI.setButtonLoading
            const sourceOrcamentoIdInput = e.target.querySelector('#sourceOrcamentoId');
            const sourceOrcamentoId = sourceOrcamentoIdInput.value; // UI.setButtonLoading

            try {
                const data = new FormData(e.target);
                const paymentType = data.get('paymentType');
                const totalInstallments = paymentType === 'single' ? 1 : parseInt(document.getElementById('installmentsCount').value);

                const saleData = {
                    clientId: data.get('client'),
                    description: data.get('description'),
                    totalValue: parseFloat(data.get('total')),
                    paymentType: paymentType,
                    totalInstallments: totalInstallments,
                    createdAt: new Date().toISOString(),
                    sourceOrcamentoId: sourceOrcamentoId || null
                };

                const saleRef = await DBService.addItem('sales', saleData);
                const sale = { id: saleRef.id, ...saleData };

                const batch = writeBatch(db);

                if (sale.paymentType === 'single') {
                    const dueDate = document.getElementById('singleDueDate').value;
                    if (!dueDate) {
                        UI.showToast("Por favor, informe a data de vencimento.", "error"); // UI.showToast
                        UI.setButtonLoading(submitBtn, false, 'Salvar');
                        return;
                    };
                    const instRef = doc(collection(db, DBService._getCollectionPath('installments')));
                    batch.set(instRef, { saleId: sale.id, clientId: sale.clientId, value: sale.totalValue, installmentNumber: 1, totalInstallments: 1, dueDate, status: 'pending' });
                } else {
                    const count = parseInt(document.getElementById('installmentsCount').value);
                    const firstDateStr = document.getElementById('firstDueDate').value;
                    if (!firstDateStr) {
                        UI.showToast("Por favor, informe a data do primeiro vencimento.", "error"); // UI.showToast
                        UI.setButtonLoading(submitBtn, false, 'Salvar');
                        return;
                    };
                    const val = sale.totalValue / count;
                    let firstDate = this.safeParseDate(firstDateStr);
                    for (let i = 1; i <= count; i++) {
                        let currentDueDate = new Date(firstDate);
                        currentDueDate.setMonth(firstDate.getMonth() + (i - 1));
                        const instRef = doc(collection(db, DBService._getCollectionPath('installments')));
                        batch.set(instRef, { saleId: sale.id, clientId: sale.clientId, value: val, installmentNumber: i, totalInstallments: count, dueDate: currentDueDate.toISOString().split('T')[0], status: 'pending' });
                    }
                }

                if (sourceOrcamentoId) {
                    const orcamentoRef = doc(db, DBService._getCollectionPath('orcamentos'), sourceOrcamentoId);
                    batch.update(orcamentoRef, { status: 'Aprovado', convertedToSale: true });
                }

                await batch.commit();

                e.target.reset();
                sourceOrcamentoIdInput.value = '';
                UI.closeModal(addSaleModal);
                UI.showToast("Venda adicionada com sucesso!"); // UI.showToast
            } catch (error) {
                console.error("Erro ao adicionar venda:", error);
                UI.showToast("Erro ao adicionar venda.", "error"); // UI.showToast
            } finally {
                UI.setButtonLoading(submitBtn, false, 'Salvar'); // UI.setButtonLoading
                if (sourceOrcamentoIdInput) {
                    sourceOrcamentoIdInput.value = '';
                }
            }
        });

        addClientForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            UI.setButtonLoading(submitBtn, true); // UI.setButtonLoading
            try { // UI.setButtonLoading
                await DBService.addItem('clients', {
                    name: e.target.clientName.value,
                    contact: e.target.clientContact.value,
                    email: e.target.clientEmail.value,
                    createdAt: new Date().toISOString()
                });
                e.target.reset();
                this.closeModal(addClientModal);
                UI.showToast("Cliente adicionado com sucesso!");
            } catch (error) {
                UI.showToast("Erro ao adicionar cliente.", "error");
            } finally {
                UI.setButtonLoading(submitBtn, false, 'Salvar');
            }
        });

        editClientForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = e.target.editClientId.value;
            const submitBtn = e.target.querySelector('button[type="submit"]');
            UI.setButtonLoading(submitBtn, true); // UI.setButtonLoading
            try {
                await DBService.updateItem('clients', id, {
                    name: e.target.editClientName.value,
                    contact: e.target.editClientContact.value,
                    email: e.target.editClientEmail.value
                });
                this.closeModal(editClientModal);
                UI.showToast("Cliente atualizado com sucesso!");
            } catch (error) {
                UI.showToast("Erro ao atualizar cliente.", "error");
            } finally {
                UI.setButtonLoading(submitBtn, false, 'Salvar');
            }
        });

        addExpenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = e.target.querySelector('button[type="submit"]');
            UI.setButtonLoading(submitBtn, true);
            try {
                await DBService.addItem('despesas', {
                    description: e.target.expenseDescription.value,
                    value: parseFloat(e.target.expenseValue.value),
                    date: e.target.expenseDate.value,
                    category: e.target.expenseCategory.value,
                    createdAt: new Date().toISOString()
                });
                e.target.reset();
                this.closeModal(addExpenseModal);
                UI.showToast("Despesa adicionada com sucesso!");
            } catch (error) {
                UI.showToast("Erro ao adicionar despesa.", "error");
            } finally {
                UI.setButtonLoading(submitBtn, false, 'Salvar');
            }
        });

        const hamburgerBtn = document.getElementById('hamburger-btn');
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const mainContentEl = document.getElementById('mainContent');
        let lastScrollTop = 0;

        hamburgerBtn.addEventListener('click', () => {
            sidebar.classList.remove('-translate-x-full');
            sidebarOverlay.classList.remove('hidden');
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.add('-translate-x-full');
            sidebarOverlay.classList.add('hidden');
        });

        mainContentEl.addEventListener('scroll', () => {
            const fabContainer = document.getElementById('fab-container');
            let scrollTop = mainContentEl.scrollTop;
            if (scrollTop > lastScrollTop && scrollTop > 100) {
                fabContainer.classList.add('translate-y-24');
            } else {
                fabContainer.classList.remove('translate-y-24');
            }
            lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;
        });
    },

    // =================================================================
    // ORÇAMENTO LOGIC
    // =================================================================
    renderOrcamentosPage() {
        document.getElementById('orcamentoSearch').addEventListener('input', () => this.renderOrcamentosList());
        document.getElementById('toggleOrcamentoFiltersBtn').addEventListener('click', () => {
            document.getElementById('orcamentoFiltersPanel').classList.toggle('hidden');
        });
        document.getElementById('clearOrcamentoFiltersBtn').addEventListener('click', () => this.clearOrcamentoFilters());

        document.getElementById('addOrcamentoBtn').addEventListener('click', () => this.openOrcamentoModal());
        this.renderOrcamentosList();
    },

    renderOrcamentosList() {
        const listEl = document.getElementById('orcamentosList');
        if (!listEl) return;

        // Setup filters
        const clientFilterSelect = document.getElementById('orcamentoFilterClient');
        const currentClientFilter = clientFilterSelect.value;
        clientFilterSelect.innerHTML = '<option value="all">Todos</option>';
        this.state.clients.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
            clientFilterSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });
        clientFilterSelect.value = currentClientFilter;

        const statusFilter = document.getElementById('orcamentoFilterStatus');
        const dateFilter = document.getElementById('orcamentoFilterDate');
        const searchFilter = document.getElementById('orcamentoSearch');

        [statusFilter, clientFilterSelect, dateFilter].forEach(el => {
            el.onchange = () => this.renderOrcamentosList();
        });

        // Apply filters
        let filteredOrcamentos = [...this.state.orcamentos];
        const searchTerm = searchFilter.value.toLowerCase();
        const status = statusFilter.value;
        const clientId = clientFilterSelect.value;
        const dateOption = dateFilter.value;

        if (searchTerm) {
            filteredOrcamentos = filteredOrcamentos.filter(o => o.title.toLowerCase().includes(searchTerm));
        }
        if (status !== 'all') {
            filteredOrcamentos = filteredOrcamentos.filter(o => o.status === status);
        }
        if (clientId !== 'all') {
            filteredOrcamentos = filteredOrcamentos.filter(o => o.clientId === clientId);
        }
        if (dateOption !== 'all') {
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = now.getMonth();
            if (dateOption === 'this_month') {
                filteredOrcamentos = filteredOrcamentos.filter(o => {
                    const d = this.safeParseDate(o.date);
                    return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
                });
            } else if (dateOption === 'last_month') {
                const lastMonth = new Date(currentYear, currentMonth - 1, 1);
                const lastMonthYear = lastMonth.getFullYear();
                const lastMonthMonth = lastMonth.getMonth();
                filteredOrcamentos = filteredOrcamentos.filter(o => {
                    const d = this.safeParseDate(o.date);
                    return d.getFullYear() === lastMonthYear && d.getMonth() === lastMonthMonth;
                });
            }
        }

        this.updateOrcamentoFilterBadge();

        const orcamentos = filteredOrcamentos.sort((a, b) => this.safeParseDate(b.date) - this.safeParseDate(a.date));
        listEl.innerHTML = '';

        if (orcamentos.length === 0) {
            listEl.innerHTML = `<div class="text-center py-16"><span class="material-symbols-outlined text-slate-400 text-5xl">search_off</span><h3 class="mt-2 text-sm font-semibold text-slate-900">Nenhum orçamento encontrado</h3><p class="mt-1 text-sm text-slate-500">Tente ajustar os filtros ou adicione uma nova proposta.</p></div>`;
            return;
        }

        orcamentos.forEach(orcamento => {
            const client = this.state.clients.find(c => c.id === orcamento.clientId);
            if (!client && clientId !== 'all') return; // Don't render if client is filtered and not found

            const isConverted = orcamento.convertedToSale === true;
            const disabledClass = ''; // REMOVIDO: isConverted ? 'opacity-50 cursor-not-allowed' : '';
            const disabledAttr = ''; // REMOVIDO: isConverted ? 'disabled' : '';

            let statusBadge;
            switch (orcamento.status) {
                case 'Aprovado': statusBadge = `<span class="text-xs font-semibold text-green-800 bg-green-100 px-2.5 py-1 rounded-full">Aprovado</span>`; break;
                case 'Recusado': statusBadge = `<span class="text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1 rounded-full">Recusado</span>`; break;
                default: statusBadge = `<span class="text-xs font-semibold text-yellow-800 bg-yellow-100 px-2.5 py-1 rounded-full">Enviado</span>`; break;
            }

            if (isConverted) {
                statusBadge = `<span class="text-xs font-semibold text-indigo-800 bg-indigo-100 px-2 py-1 rounded-full flex items-center justify-center gap-1"><span class="material-symbols-outlined text-base leading-none">check_circle</span>Convertido</span>`;
            }

            const item = document.createElement('div');
            item.className = 'relative bg-white md:bg-transparent rounded-xl md:rounded-none shadow-sm md:shadow-none border md:border-0 mb-3 md:mb-0';

            item.innerHTML = `
                        <div class="p-4 md:hidden">
                            <div class="flex justify-between items-start">
                                <div class="min-w-0">
                                    <p class="font-semibold text-slate-800 truncate">${client?.name || 'Cliente Apagado'}</p>
                                    <p class="text-sm text-slate-500 truncate">${orcamento.title}</p>
                                </div>
                                <button data-id="${orcamento.id}" class="orcamento-actions-btn text-slate-500 hover:text-slate-800 p-1 -mt-1 -mr-1 rounded-full flex-shrink-0" ${disabledAttr}><span class="material-symbols-outlined">more_vert</span></button>
                            </div>
                            <div class="mt-4 pt-3 border-t border-slate-200 flex justify-between items-end">
                                <div>
                                    <p class="text-xs text-slate-400 font-medium">VALOR</p>
                                    <p class="font-semibold text-slate-900">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcamento.totalValue)}</p>
                                </div>
                                ${statusBadge}
                            </div>
                        </div>

                        <div class="hidden md:grid grid-cols-12 gap-4 items-center p-4 border-b border-slate-200 hover:bg-slate-50 transition-colors">
                            <div class="col-span-4 min-w-0">
                                <p class="font-semibold text-slate-800 truncate">${client?.name || 'Cliente Apagado'}</p>
                                <p class="text-sm text-slate-500 truncate">${orcamento.title}</p>
                            </div>
                            <div class="col-span-2 text-sm text-slate-600">${this.safeParseDate(orcamento.date).toLocaleDateString('pt-BR')}</div>
                            <div class="col-span-2 text-center">${statusBadge}</div>
                            <div class="col-span-2 text-right font-semibold">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcamento.totalValue)}</div>
                            <div class="col-span-2 text-right">
                                <button data-id="${orcamento.id}" class="orcamento-actions-btn text-slate-500 hover:text-slate-800 p-1 rounded-full" ${disabledAttr}><span class="material-symbols-outlined">more_vert</span></button>
                            </div>
                        </div>

                        <div id="actions-menu-${orcamento.id}" class="absolute right-4 top-12 md:right-6 md:top-14 w-48 bg-white rounded-md shadow-lg py-1 hidden z-10 ring-1 ring-black ring-opacity-5">
                            ${isConverted ? `
                                <span class="flex items-center w-full px-4 py-2 text-sm text-slate-500">
                                    <span class="material-symbols-outlined text-base mr-2">lock</span>Convertido em Venda
                                </span>
                                <div class="my-1 h-px bg-slate-200"></div>
                                <button data-id="${orcamento.id}" class="view-orcamento-btn flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 text-left"><span class="material-symbols-outlined text-base mr-2">visibility</span>Visualizar</button>
                            ` : `
                                <button data-id="${orcamento.id}" class="view-orcamento-btn hidden md:flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 text-left">
                                    <span class="material-symbols-outlined text-base mr-2">visibility</span>Visualizar
                                </button>
                                <button data-id="${orcamento.id}" class="download-orcamento-btn flex md:hidden items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 text-left"><span class="material-symbols-outlined text-base mr-2">download</span>Baixar PDF</button>
                                <button data-id="${orcamento.id}" class="edit-orcamento-btn flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 text-left"><span class="material-symbols-outlined text-base mr-2">edit</span>Editar</button>
                                <button data-id="${orcamento.id}" class="convert-orcamento-btn flex items-center w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 text-left"><span class="material-symbols-outlined text-base mr-2">transform</span>Converter em Venda</button>
                                <div class="my-1 h-px bg-slate-200"></div>
                                <button data-id="${orcamento.id}" data-status="Aprovado" class="change-status-orcamento-btn flex items-center w-full px-4 py-2 text-sm text-green-600 hover:bg-slate-100 text-left"><span class="material-symbols-outlined text-base mr-2">check_circle</span>Marcar como Aprovado</button>
                                <button data-id="${orcamento.id}" data-status="Recusado" class="change-status-orcamento-btn flex items-center w-full px-4 py-2 text-sm text-orange-600 hover:bg-slate-100 text-left"><span class="material-symbols-outlined text-base mr-2">cancel</span>Marcar como Recusado</button>
                                <div class="my-1 h-px bg-slate-200"></div>
                                <button data-id="${orcamento.id}" class="delete-orcamento-btn flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-slate-100 text-left"><span class="material-symbols-outlined text-base mr-2">delete</span>Apagar</button>
                            `}
                        </div>
                    `;
            listEl.appendChild(item);
        });
    },

    clearOrcamentoFilters() {
        document.getElementById('orcamentoSearch').value = '';
        document.getElementById('orcamentoFilterStatus').value = 'all';
        document.getElementById('orcamentoFilterClient').value = 'all';
        document.getElementById('orcamentoFilterDate').value = 'all';
        this.renderOrcamentosList();
    },

    updateOrcamentoFilterBadge() {
        const status = document.getElementById('orcamentoFilterStatus').value;
        const client = document.getElementById('orcamentoFilterClient').value;
        const date = document.getElementById('orcamentoFilterDate').value;
        const badge = document.getElementById('orcamentoFilterBadge');

        if (status !== 'all' || client !== 'all' || date !== 'all') {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    openOrcamentoModal(orcamentoId = null, preselectedClientId = null) {
        const modal = document.getElementById('orcamentoModal');
        const form = document.getElementById('orcamentoForm');

        const existingIdField = form.querySelector('#editOrcamentoId');
        if (existingIdField) existingIdField.remove();

        const h2 = modal.querySelector('h2');
        const submitBtn = form.querySelector('button[type="submit"]');
        const isEditing = orcamentoId !== null;

        const clientSelect = document.getElementById('orcamentoClientSelect');
        clientSelect.innerHTML = '<option value="">Selecione um cliente</option>';
        this.state.clients.forEach(c => {
            clientSelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
        });

        const itemsContainer = document.getElementById('orcamentoItemsContainer');
        itemsContainer.innerHTML = '';

        const singleDueDateInput = document.getElementById('orcamentoSingleDueDate');
        const installmentsCountInput = document.getElementById('orcamentoInstallmentsCount');
        const firstDueDateInput = document.getElementById('orcamentoFirstDueDate');

        if (isEditing) {
            h2.textContent = 'Editar Orçamento';
            submitBtn.textContent = 'Salvar Alterações';

            const orcamentoToEdit = this.state.orcamentos.find(o => o.id === orcamentoId);
            if (!orcamentoToEdit) {
                UI.showToast('Orçamento não encontrado.', 'error');
                return;
            }

            form.insertAdjacentHTML('beforeend', `<input type="hidden" id="editOrcamentoId" value="${orcamentoId}">`);

            clientSelect.value = orcamentoToEdit.clientId;
            document.getElementById('orcamentoTitle').value = orcamentoToEdit.title;
            document.getElementById('orcamentoDate').value = orcamentoToEdit.date;
            document.getElementById('orcamentoValidity').value = orcamentoToEdit.validity;

            const items = JSON.parse(orcamentoToEdit.items);
            items.forEach(itemData => this.addOrcamentoItem(itemData));

            const paymentType = orcamentoToEdit.paymentType || 'single';
            const radioToCheck = form.querySelector(`input[name="orcamentoPaymentType"][value="${paymentType}"]`);
            if (radioToCheck) {
                radioToCheck.checked = true;
                radioToCheck.dispatchEvent(new Event('change'));
            }

            if (paymentType === 'installments') {
                installmentsCountInput.value = orcamentoToEdit.installmentsCount || 2;
                firstDueDateInput.value = orcamentoToEdit.firstDueDate || '';
                installmentsCountInput.required = true;
                firstDueDateInput.required = true;
                singleDueDateInput.required = false;
            } else {
                singleDueDateInput.value = orcamentoToEdit.singleDueDate || '';
                installmentsCountInput.required = false;
                firstDueDateInput.required = false;
                singleDueDateInput.required = true;
            }

        } else { // Creating new
            form.reset();
            h2.textContent = 'Novo Orçamento';
            submitBtn.textContent = 'Salvar Orçamento';
            document.getElementById('orcamentoDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('orcamentoSingleDueDate').value = new Date().toISOString().split('T')[0];
            document.getElementById('orcamentoFirstDueDate').value = new Date().toISOString().split('T')[0];

            const singleRadio = form.querySelector('input[name="orcamentoPaymentType"][value="single"]');
            singleRadio.checked = true;
            singleRadio.dispatchEvent(new Event('change'));

            if (preselectedClientId) {
                clientSelect.value = preselectedClientId;
            }

            installmentsCountInput.required = false;
            firstDueDateInput.required = false;
            singleDueDateInput.required = true;

            this.addOrcamentoItem();
        }

        if (!modal.dataset.listenersAttached) {
            document.getElementById('addOrcamentoItemBtn').addEventListener('click', () => this.addOrcamentoItem());

            modal.querySelectorAll('input[name="orcamentoPaymentType"]').forEach(radio => {
                radio.addEventListener('change', () => {
                    const singleFields = document.getElementById('orcamentoSinglePaymentFields');
                    const installmentsFields = document.getElementById('orcamentoInstallmentsFields');
                    const sdi = document.getElementById('orcamentoSingleDueDate');
                    const ici = document.getElementById('orcamentoInstallmentsCount');
                    const fdi = document.getElementById('orcamentoFirstDueDate');

                    if (radio.value === 'installments') {
                        singleFields.classList.add('hidden');
                        installmentsFields.classList.remove('hidden');
                        ici.required = true;
                        fdi.required = true;
                        sdi.required = false;
                    } else {
                        installmentsFields.classList.add('hidden');
                        singleFields.classList.remove('hidden');
                        ici.required = false;
                        fdi.required = false;
                        sdi.required = true;
                    }
                });
            });

            itemsContainer.addEventListener('click', (e) => {
                if (e.target.closest('.remove-item-btn')) {
                    if (itemsContainer.childElementCount > 1) {
                        e.target.closest('.orcamento-item').remove();
                        this.updateOrcamentoTotal();
        } else { // UI.showToast
                        UI.showToast('O orçamento deve ter pelo menos um item.', 'error');
                    }
                }
            });

            itemsContainer.addEventListener('input', (e) => {
                if (e.target.matches('.item-qty, .item-price')) {
                    this.updateOrcamentoTotal();
                }
            });

            form.addEventListener('submit', this.handleOrcamentoFormSubmit.bind(this));
            modal.dataset.listenersAttached = 'true';
        }

        this.updateOrcamentoTotal();
        UI.openModal(modal);
    },

    async handleOrcamentoFormSubmit(e) {
        e.preventDefault();
        const form = e.target;

        if (!form.checkValidity()) {
            let errorMessage = 'Por favor, preencha todos os campos obrigatórios.';
            const firstInvalid = form.querySelector(':invalid');
            if (firstInvalid) {
                const label = form.querySelector(`label[for="${firstInvalid.id}"]`);
                errorMessage = label ? `O campo "${label.textContent}" é obrigatório.` : `Um campo obrigatório não foi preenchido.`;
            }
            UI.showToast(errorMessage, 'error'); // UI.showToast
            form.reportValidity();
            return;
        }

        const itemsForValidation = document.querySelectorAll('#orcamentoItemsContainer .orcamento-item');
        if (itemsForValidation.length === 0) {
            UI.showToast('É necessário adicionar pelo menos um item ao orçamento.', 'error');
            return; // UI.showToast
        }

        for (const item of itemsForValidation) {
            const descInputs = item.querySelectorAll('.item-desc');
            const hasValue = Array.from(descInputs).some(input => input.offsetParent !== null && input.value.trim() !== '');
            if (!hasValue) { // UI.showToast
                this.showToast('A descrição de um item não pode estar vazia.', 'error');
                const visibleInput = Array.from(descInputs).find(i => i.offsetParent !== null) || descInputs[0]; // UI.showToast
                if (visibleInput) visibleInput.focus();
                return;
            }
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const editingId = form.querySelector('#editOrcamentoId')?.value;
        const loadingText = editingId ? 'A salvar...' : 'A criar...'; // UI.setButtonLoading
        UI.setButtonLoading(submitBtn, true, loadingText); // UI.setButtonLoading

        try {
            const items = [];
            document.querySelectorAll('#orcamentoItemsContainer .orcamento-item').forEach(item => {
                const descInput = Array.from(item.querySelectorAll('.item-desc')).find(i => i.offsetParent !== null) || item.querySelectorAll('.item-desc')[0];
                const qtyInput = Array.from(item.querySelectorAll('.item-qty')).find(i => i.offsetParent !== null) || item.querySelectorAll('.item-qty')[0];
                const priceInput = Array.from(item.querySelectorAll('.item-price')).find(i => i.offsetParent !== null) || item.querySelectorAll('.item-price')[0];
                items.push({
                    description: descInput.value,
                    quantity: parseFloat(qtyInput.value) || 1,
                    price: parseFloat(priceInput.value) || 0
                });
            });

            const totalValue = items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
            const paymentType = form.elements.orcamentoPaymentType.value;
            const orcamentoData = {
                clientId: document.getElementById('orcamentoClientSelect').value,
                title: document.getElementById('orcamentoTitle').value,
                date: document.getElementById('orcamentoDate').value,
                validity: parseInt(document.getElementById('orcamentoValidity').value),
                items: JSON.stringify(items),
                totalValue,
                paymentType: paymentType,
                installmentsCount: paymentType === 'installments' ? parseInt(document.getElementById('orcamentoInstallmentsCount').value) : 1,
                firstDueDate: paymentType === 'installments' ? document.getElementById('orcamentoFirstDueDate').value : null,
                singleDueDate: paymentType === 'single' ? document.getElementById('orcamentoSingleDueDate').value : null,
            };

            if (editingId) {
                const originalOrcamento = this.state.orcamentos.find(o => o.id === editingId);
                orcamentoData.status = originalOrcamento.status;
                orcamentoData.createdAt = originalOrcamento.createdAt;
                await DBService.updateItem('orcamentos', editingId, orcamentoData); // UI.showToast
                UI.showToast('Orçamento atualizado com sucesso!');
            } else {
                orcamentoData.status = 'Enviado';
                orcamentoData.createdAt = new Date().toISOString();
                await DBService.addItem('orcamentos', orcamentoData); // UI.showToast
                UI.showToast('Orçamento salvo com sucesso!');
            }

            UI.closeModal(document.getElementById('orcamentoModal'));

        } catch (error) { // UI.showToast
            console.error("Erro ao salvar orçamento:", error);
            this.showToast('Erro ao salvar orçamento.', 'error');
        } finally {
            const originalText = editingId ? 'Salvar Alterações' : 'Salvar Orçamento';
            UI.setButtonLoading(submitBtn, false, originalText);
        } // UI.setButtonLoading
    },

    addOrcamentoItem(itemData = null) {
        const container = document.getElementById('orcamentoItemsContainer');
        const itemDiv = document.createElement('div');
        itemDiv.className = 'orcamento-item border-b border-slate-200 last:border-b-0 py-2';
        itemDiv.innerHTML = `
                    <div class="md:hidden space-y-2">
                        <div class="flex justify-between items-start gap-2">
                            <div class="flex-grow">
                                <label class="block text-xs font-medium text-slate-500 mb-1">Descrição</label>
                                <input type="text" class="item-desc w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" placeholder="Descrição do item">
                            </div>
                            <button type="button" class="remove-item-btn text-slate-400 hover:text-red-600 p-1 mt-6 flex-shrink-0 transition-colors"><span class="material-symbols-outlined">delete</span></button>
                        </div>
                        <div class="grid grid-cols-3 gap-3">
                            <div>
                                <label class="block text-xs font-medium text-slate-500 mb-1">Qtd.</label>
                                <input type="number" class="item-qty w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" value="1" min="1">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-slate-500 mb-1">Preço Unit.</label>
                                <input type="number" class="item-price w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" placeholder="0.00" step="0.01" min="0">
                            </div>
                            <div>
                                <label class="block text-xs font-medium text-slate-500 mb-1">Subtotal</label>
                                <p class="item-total h-10 flex items-center justify-end px-3 font-semibold text-slate-800">R$ 0,00</p>
                            </div>
                        </div>
                    </div>
                    <div class="hidden md:grid grid-cols-12 gap-4 items-center">
                        <div class="col-span-5">
                            <input type="text" class="item-desc w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" placeholder="Descrição do item">
                        </div>
                        <div class="col-span-2">
                            <input type="number" class="item-qty w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" value="1" min="1">
                        </div>
                        <div class="col-span-2">
                            <input type="number" class="item-price w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" placeholder="0.00" step="0.01" min="0">
                        </div>
                        <div class="col-span-2 text-right">
                            <span class="item-total font-semibold text-slate-800">R$ 0,00</span>
                        </div>
                        <div class="col-span-1 text-right">
                            <button type="button" class="remove-item-btn text-slate-400 hover:text-red-600 p-1 rounded-full transition-colors"><span class="material-symbols-outlined">delete</span></button>
                        </div>
                    </div>
                `;
        container.appendChild(itemDiv);

        if (itemData) {
            itemDiv.querySelectorAll('.item-desc').forEach(el => el.value = itemData.description || '');
            itemDiv.querySelectorAll('.item-qty').forEach(el => el.value = itemData.quantity || 1);
            itemDiv.querySelectorAll('.item-price').forEach(el => el.value = itemData.price || 0);
        } else {
            itemDiv.querySelector('.item-desc').focus();
        }
    },

    updateOrcamentoTotal() {
        const items = document.querySelectorAll('#orcamentoItemsContainer .orcamento-item');
        let total = 0;
        items.forEach(item => {
            const qtyInputs = item.querySelectorAll('.item-qty');
            const priceInputs = item.querySelectorAll('.item-price');

            const visibleQtyInput = Array.from(qtyInputs).find(i => i.offsetParent !== null) || qtyInputs[0];
            const visiblePriceInput = Array.from(priceInputs).find(i => i.offsetParent !== null) || priceInputs[0];

            const qty = parseFloat(visibleQtyInput.value) || 0;
            const price = parseFloat(visiblePriceInput.value) || 0;
            const itemTotal = qty * price;

            item.querySelectorAll('.item-total').forEach(el => {
                el.textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(itemTotal);
            });
            total += itemTotal;
        });
        document.getElementById('orcamentoTotal').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total);
    },

    renderClientDetailPage(clientId) {
        const client = this.state.clients.find(c => c.id === clientId);
        if (!client) {
            UI.showToast("Cliente não encontrado.", "error");
            this.navigateTo('clients');
            return;
        }

        document.getElementById('pageTitle').textContent = client.name;

        const headerEl = document.getElementById('clientDetailHeader');
        if (!headerEl) {
            console.error("Elemento clientDetailHeader não encontrado. A navegação pode ter sido interrompida.");
            return;
        }

        headerEl.innerHTML = `
                    <div>
                        <h2 class="text-3xl font-bold text-slate-800">${client.name}</h2>
                        <p class="text-slate-500 mt-1">${client.email || 'Sem e-mail'} | ${client.contact || 'Sem telefone'}</p>
                    </div>
                `;

        document.getElementById('backToClientsBtn').onclick = () => this.navigateTo('clients');
        document.getElementById('clientDetailNewOrcamentoBtn').onclick = () => {
            this.openOrcamentoModal(null, clientId);
        };

        // Render Client Financial Summary
        const clientSales = this.state.sales.filter(s => s.clientId === clientId);
        const totalFaturado = clientSales.reduce((sum, sale) => sum + sale.totalValue, 0);

        const clientInstallments = this.state.installments.filter(i => i.clientId === clientId);
        const totalPago = clientInstallments
            .filter(i => i.status === 'paid')
            .reduce((sum, inst) => sum + inst.value, 0);

        const saldoDevedor = totalFaturado - totalPago;

        document.getElementById('clientSummaryTotalFaturado').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalFaturado);
        document.getElementById('clientSummaryTotalPago').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPago);
        document.getElementById('clientSummarySaldoDevedor').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(saldoDevedor);

        this.renderClientBillingHistoryChart(clientId);
        this.renderClientOrcamentosList(clientId);
        this.renderClientCobrancasList(clientId);
        this.renderClientNotes(clientId);

        // Tab switching logic
        const tabs = document.getElementById('client-detail-tabs');
        if (tabs) {
            tabs.addEventListener('click', e => {
                const button = e.target.closest('.client-tab-btn');
                if (!button) return;

                // Update button styles
                document.querySelectorAll('.client-tab-btn').forEach(btn => {
                    btn.classList.remove('border-indigo-500', 'text-indigo-600', 'font-semibold');
                    btn.classList.add('border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300', 'font-medium');
                });
                button.classList.add('border-indigo-500', 'text-indigo-600', 'font-semibold');
                button.classList.remove('border-transparent', 'text-slate-500', 'hover:text-slate-700', 'hover:border-slate-300', 'font-medium');

                // Update content visibility
                document.querySelectorAll('.client-tab-content').forEach(content => {
                    content.classList.add('hidden');
                });
                document.getElementById(`client-tab-content-${button.dataset.tab}`).classList.remove('hidden');
            });
        }
    },

    renderClientOrcamentosList(clientId) {
        const orcamentosContainer = document.getElementById('client-tab-content-orcamentos');
        if (!orcamentosContainer) return;

        const clientOrcamentos = this.state.orcamentos
            .filter(o => o.clientId === clientId)
            .sort((a, b) => this.safeParseDate(b.date) - this.safeParseDate(a.date));

        if (clientOrcamentos.length === 0) {
            orcamentosContainer.innerHTML = `<div class="card p-6 text-center text-slate-500">Nenhum orçamento encontrado para este cliente.</div>`;
            return;
        }

        orcamentosContainer.innerHTML = clientOrcamentos.map(orcamento => {
            let statusBadge;
            const isConverted = orcamento.convertedToSale === true;
            if (isConverted) {
                statusBadge = `<span class="text-xs font-semibold text-indigo-800 bg-indigo-100 px-2 py-1 rounded-full flex items-center gap-1"><span class="material-symbols-outlined text-base leading-none">check_circle</span>Convertido</span>`;
            } else {
                switch (orcamento.status) {
                    case 'Aprovado': statusBadge = `<span class="text-xs font-semibold text-green-800 bg-green-100 px-2.5 py-1 rounded-full">Aprovado</span>`; break;
                    case 'Recusado': statusBadge = `<span class="text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1 rounded-full">Recusado</span>`; break;
                    default: statusBadge = `<span class="text-xs font-semibold text-yellow-800 bg-yellow-100 px-2.5 py-1 rounded-full">Enviado</span>`; break;
                }
            }

            return `
                        <div class="border border-slate-200 rounded-lg">
                            <div class="p-4 flex justify-between items-center cursor-pointer hover:bg-slate-50" data-orcamento-id="${orcamento.id}">
                                <div class="min-w-0">
                                    <p class="font-semibold text-slate-800 truncate">${orcamento.title}</p>
                                    <p class="text-sm text-slate-500">Emitido em: ${this.safeParseDate(orcamento.date).toLocaleDateString('pt-BR')}</p>
                                </div>
                                <div class="flex items-center gap-4 flex-shrink-0 ml-4">
                                    ${statusBadge}
                                    <span class="material-symbols-outlined text-slate-400 transition-transform expand-chevron">expand_more</span>
                                </div>
                            </div>
                            <div id="detail-${orcamento.id}" class="hidden"></div>
                        </div>
                    `;
        }).join('');

        orcamentosContainer.querySelectorAll('[data-orcamento-id]').forEach(header => {
            header.addEventListener('click', () => {
                const orcamentoId = header.dataset.orcamentoId;
                const detailContainer = document.getElementById(`detail-${orcamentoId}`);
                const icon = header.querySelector('.expand-chevron');

                const isOpen = !detailContainer.classList.contains('hidden');

                orcamentosContainer.querySelectorAll('[id^="detail-"]').forEach(el => el.classList.add('hidden'));
                orcamentosContainer.querySelectorAll('[data-orcamento-id] .expand-chevron').forEach(i => i.classList.remove('rotate-180'));

                if (isOpen) {
                    detailContainer.classList.add('hidden');
                    icon.classList.remove('rotate-180');
                } else {
                    this.renderOrcamentoFinancialDetail(orcamentoId, detailContainer);
                    detailContainer.classList.remove('hidden');
                    icon.classList.add('rotate-180');
                }
            });
        });
    },

    renderClientCobrancasList(clientId) {
        const cobrancasContainer = document.getElementById('client-tab-content-cobrancas');
        if (!cobrancasContainer) return;

        const clientInstallments = this.state.installments
            .filter(i => i.clientId === clientId)
            .sort((a, b) => this.safeParseDate(b.dueDate) - this.safeParseDate(a.dueDate));

        if (clientInstallments.length === 0) {
            cobrancasContainer.innerHTML = `<div class="card p-6 text-center text-slate-500">Nenhuma cobrança encontrada para este cliente.</div>`;
            return;
        }

        const today = new Date(); today.setHours(0, 0, 0, 0);

        cobrancasContainer.innerHTML = clientInstallments.map(inst => {
            const sale = this.state.sales.find(s => s.id === inst.saleId);
            const dueDate = this.safeParseDate(inst.dueDate);
            const isOverdue = inst.status === 'pending' && dueDate < today;
            let statusBadge;
            if (inst.status === 'paid') { statusBadge = `<span class="text-xs font-semibold text-green-800 bg-green-100 px-2.5 py-1 rounded-full">Paga</span>`; }
            else if (isOverdue) { statusBadge = `<span class="text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1 rounded-full">Vencida</span>`; }
            else { statusBadge = `<span class="text-xs font-semibold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full">Em Aberto</span>`; }

            const markPaidButton = inst.status === 'pending'
                ? `<button data-id="${inst.id}" title="Marcar como Paga" class="mark-installment-paid-btn text-slate-400 hover:text-green-600 p-1 rounded-full transition-colors"><span class="material-symbols-outlined">check_circle</span></button>`
                : '';

            return `
                        <div class="bg-white p-4 rounded-lg border border-slate-200 grid grid-cols-12 gap-4 items-center">
                            <div class="col-span-12 md:col-span-6">
                                <p class="font-medium text-slate-800">${sale?.description || 'Venda sem descrição'} (${inst.installmentNumber}/${inst.totalInstallments})</p>
                                <p class="text-sm text-slate-500">Vencimento: ${dueDate.toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div class="col-span-4 md:col-span-2 font-semibold text-slate-800">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}</div>
                            <div class="col-span-4 md:col-span-2 text-center">${statusBadge}</div>
                            <div class="col-span-4 md:col-span-2 text-right">${markPaidButton}</div>
                        </div>
                    `;
        }).join('');
    },

    renderClientNotes(clientId) {
        const container = document.getElementById('client-tab-content-notas');
        if (!container) return;

        const client = this.state.clients.find(c => c.id === clientId);
        if (!client) return;

        container.innerHTML = `
                    <div class="card p-6">
                        <h3 class="text-xl font-bold text-slate-800 mb-4">Anotações sobre o Cliente</h3>
                        <textarea id="clientNotesTextarea" class="w-full h-64 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition" placeholder="Adicione notas sobre preferências, negociações, próximos passos, etc.">${client.notes || ''}</textarea>
                        <div class="text-right mt-4">
                            <button id="saveClientNotesBtn" class="bg-indigo-700 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-800 transition-colors shadow-sm">
                                Salvar Notas
                            </button>
                        </div>
                    </div>
                `;

        document.getElementById('saveClientNotesBtn').addEventListener('click', async (e) => {
            const button = e.currentTarget;
            this.setButtonLoading(button, true, 'A salvar...');
            const newNotes = document.getElementById('clientNotesTextarea').value;
            await DBService.updateItem('clients', clientId, { notes: newNotes });
            this.showToast('Notas salvas com sucesso!');
            // Não é necessário `setButtonLoading(false)` aqui, pois a re-renderização da página ao receber os dados do Firebase irá recriar o botão.
            // No entanto, para uma resposta visual imediata, podemos adicioná-lo:
            this.setButtonLoading(button, false, 'Salvar Notas');
        });
    },

    renderClientBillingHistoryChart(clientId) {
        const ctx = document.getElementById('clientBillingHistoryChart')?.getContext('2d');
        if (!ctx) return;
        if (this.clientBillingHistoryChart) this.clientBillingHistoryChart.destroy();

        const labels = [];
        const data = [];
        const today = new Date();

        for (let i = 11; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            labels.push(d.toLocaleString('pt-BR', { month: 'short' }).replace('.', ''));
            const month = d.getMonth();
            const year = d.getFullYear();

            const monthlyRevenue = this.state.installments
                .filter(inst => inst.clientId === clientId && inst.status === 'paid' && this.safeParseDate(inst.paidDate).getMonth() === month && this.safeParseDate(inst.paidDate).getFullYear() === year)
                .reduce((sum, inst) => sum + inst.value, 0);
            data.push(monthlyRevenue);
        }

        this.clientBillingHistoryChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ label: 'Faturação Mensal', data, backgroundColor: '#4338ca' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    },

    renderOrcamentoFinancialDetail(orcamentoId, container) {
        const orcamento = this.state.orcamentos.find(o => o.id === orcamentoId);
        if (!orcamento) return;

        container.innerHTML = document.getElementById('clientOrcamentoDetailTemplate').innerHTML;

        // Render items
        const items = JSON.parse(orcamento.items);
        container.querySelector('#orcamento-items-list').innerHTML = items.map(item => `
                    <div class="flex justify-between"><span>${item.quantity}x ${item.description}</span> <span class="font-medium">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}</span></div>
                `).join('');

        // Render financial details
        let sale = this.state.sales.find(s => s.sourceOrcamentoId === orcamentoId);

        // Fallback for old data that doesn't have sourceOrcamentoId
        if (!sale && orcamento.convertedToSale) {
            sale = this.state.sales.find(s =>
                s.clientId === orcamento.clientId && s.description === orcamento.title && s.totalValue === orcamento.totalValue
            );
        }

        const installments = sale ? this.state.installments.filter(i => i.saleId === sale.id) : [];
        const totalPaid = installments.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.value, 0);
        const totalDue = orcamento.totalValue - totalPaid;

        container.querySelector('#finance-total').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcamento.totalValue);
        container.querySelector('#finance-paid').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPaid);
        container.querySelector('#finance-due').textContent = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDue);

        const installmentsListEl = container.querySelector('#orcamento-installments-list');
        if (installments.length > 0) {
            const today = new Date(); today.setHours(0, 0, 0, 0);
            installmentsListEl.innerHTML = installments.sort((a, b) => a.installmentNumber - b.installmentNumber).map(inst => {
                const dueDate = this.safeParseDate(inst.dueDate);
                const isOverdue = inst.status === 'pending' && dueDate < today;
                let statusBadge;
                if (inst.status === 'paid') { statusBadge = `<span class="text-xs font-semibold text-green-800 bg-green-100 px-2.5 py-1 rounded-full">Paga</span>`; }
                else if (isOverdue) { statusBadge = `<span class="text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1 rounded-full">Vencida</span>`; }
                else { statusBadge = `<span class="text-xs font-semibold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full">Em Aberto</span>`; }

                const markPaidButton = inst.status === 'pending'
                    ? `<button data-id="${inst.id}" title="Marcar como Paga" class="mark-installment-paid-btn text-slate-400 hover:text-green-600 p-1 rounded-full transition-colors">
                                   <span class="material-symbols-outlined">check_circle</span>
                               </button>`
                    : '';

                return `
                            <div class="flex justify-between items-center text-sm p-2 rounded-md ${inst.status === 'paid' ? 'bg-green-50' : (isOverdue ? 'bg-red-50' : 'bg-blue-50')}">
                                <span>Parcela ${inst.installmentNumber}/${inst.totalInstallments} - Venc. ${dueDate.toLocaleDateString('pt-BR')}</span>
                                <div class="flex items-center gap-3">
                                    <span class="font-medium">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}</span>
                                    ${statusBadge}
                                    ${markPaidButton}
                                </div>
                            </div>
                        `;
            }).join('');
        } else {
            if (orcamento.convertedToSale) {
                installmentsListEl.innerHTML = `<p class="text-sm text-slate-500 text-center">As parcelas para esta venda ainda não foram geradas.</p>`;
            } else {
                installmentsListEl.innerHTML = `<p class="text-sm text-slate-500 text-center">Este orçamento ainda não foi convertido em venda.</p>`;
            }
        }

        // Add event listener for the new buttons
        container.querySelectorAll('.mark-installment-paid-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the accordion from closing
                const installmentId = e.currentTarget.dataset.id;
                DBService.updateItem('installments', installmentId, { status: 'paid', paidDate: new Date().toISOString().split('T')[0] });
                this.showToast('Parcela marcada como paga!');
            });
        });
    },

    async preparePdfContent(orcamentoId) {
        const orcamento = this.state.orcamentos.find(o => o.id === orcamentoId);
        if (!orcamento) {
            console.error("Orçamento não encontrado para preparar o PDF.");
            return null;
        }

        const getBase64Image = (url) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataURL = canvas.toDataURL('image/png');
                    resolve(dataURL);
                };
                img.onerror = reject;
                img.src = url;
            });
        };
        const logoBase64 = await getBase64Image('logo_atlas.png');

        const client = this.state.clients.find(c => c.id === orcamento.clientId);
        const user = AuthService.currentUser;

        const items = JSON.parse(orcamento.items);
        const itemsHtml = items.map(item => `
                    <tr class="border-b border-slate-200">
                        <td data-label="Item" class="py-3 pr-2">${item.description}</td>
                        <td data-label="Qtd." class="py-3 text-center">${item.quantity}</td>
                        <td data-label="Preço Unit." class="py-3 text-right">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.price)}</td>
                        <td data-label="Subtotal" class="py-3 text-right">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.quantity * item.price)}</td>
                    </tr>
                `).join('');

        const dueDate = this.safeParseDate(orcamento.date);
        dueDate.setDate(dueDate.getDate() + orcamento.validity);

        let paymentDetailsHtml = '';
        if (orcamento.paymentType === 'single') {
            paymentDetailsHtml = `<p><strong>Pagamento:</strong> À Vista</p>`;
        } else if (orcamento.paymentType === 'installments') {
            paymentDetailsHtml = `<p class="mb-2"><strong>Pagamento:</strong> Parcelado em ${orcamento.installmentsCount}x</p>`;
            let installmentsTable = '<table class="w-full text-left mt-2 text-sm"><thead><tr class="bg-slate-50"><th class="p-1 font-medium">Parcela</th><th class="p-1 font-medium">Vencimento</th><th class="p-1 font-medium text-right">Valor</th></tr></thead><tbody>';
            const installmentValue = orcamento.totalValue / orcamento.installmentsCount;
            let firstDueDate = this.safeParseDate(orcamento.firstDueDate);
            for (let i = 1; i <= orcamento.installmentsCount; i++) {
                let currentDueDate = new Date(firstDueDate);
                currentDueDate.setMonth(firstDueDate.getMonth() + (i - 1));
                installmentsTable += `<tr>
                            <td class="p-1 border-t">${i}</td>
                            <td class="p-1 border-t">${currentDueDate.toLocaleDateString('pt-BR')}</td>
                            <td class="p-1 border-t text-right">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(installmentValue)}</td>
                        </tr>`;
            }
            installmentsTable += '</tbody></table>';
            paymentDetailsHtml += installmentsTable;
        }

        return `
                    <div style="padding: 40px; font-family: 'Inter', sans-serif; color: #374151;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 1.5rem; border-bottom: 1px solid #e5e7eb;">
                            ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="height: 90px; width: auto;">` : `<span></span>`}
                            <div style="text-align: right;">
                                <h3 style="font-weight: 600; font-size: 1rem;">${user.name || user.displayName}</h3>
                                <p style="font-size: 0.875rem; color: #6b7280;">${user.email}</p>
                            </div>
                        </div>
                        <div style="margin-top: 2.5rem; display: flex; justify-content: space-between; align-items: flex-end;">
                            <div>
                                <h1 style="font-size: 2.25rem; font-weight: 800; color: #111827;">Orçamento</h1>
                                <p style="color: #6b7280; margin-top: 0.25rem; font-family: monospace;">#${orcamento.id.substring(0, 7).toUpperCase()}</p>
                            </div>
                            <div style="text-align: right; font-size: 0.875rem;">
                                <p><strong style="color: #4b5563;">Data de Emissão:</strong> ${this.safeParseDate(orcamento.date).toLocaleDateString('pt-BR')}</p>
                                <p><strong style="color: #4b5563;">Válido até:</strong> ${dueDate.toLocaleDateString('pt-BR')}</p>
                            </div>
                        </div>
                        <div style="margin-top: 2.5rem;">
                            <h3 style="font-size: 0.75rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Para</h3>
                            <p style="font-weight: 600; color: #111827;">${client.name}</p>
                            <p style="font-size: 0.875rem; color: #6b7280;">${client.email || ''}</p>
                        </div>
                        <table style="width: 100%; text-align: left; margin-top: 2.5rem; border-collapse: collapse;">
                            <thead>
                                <tr style="color: #4b5563; font-size: 0.875rem; border-bottom: 1px solid #d1d5db;">
                                    <th style="font-weight: 600; padding: 0.75rem 0.5rem; width: 50%;">Item</th>
                                    <th style="font-weight: 600; padding: 0.75rem 0.5rem; text-align: center;">Qtd.</th>
                                    <th style="font-weight: 600; padding: 0.75rem 0.5rem; text-align: right;">Preço Unit.</th>
                                    <th style="font-weight: 600; padding: 0.75rem 0.5rem; text-align: right;">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody style="font-size: 0.875rem;">
                                ${itemsHtml}
                            </tbody>
                        </table>
                        <div style="margin-top: 2.5rem; display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="max-width: 50%; font-size: 0.875rem;">
                                <h3 style="font-weight: 600; color: #111827; margin-bottom: 0.5rem;">Condições de Pagamento</h3>
                                ${paymentDetailsHtml}
                            </div>
                            <div style="width: 320px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem;">
                                <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; font-size: 0.875rem;">
                                    <span style="color: #6b7280;">Subtotal:</span>
                                    <strong style="color: #374151;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcamento.totalValue)}</strong>
                                </div>
                                <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; margin-top: 0.5rem; border-top: 1px solid #e5e7eb;">
                                    <span style="font-weight: 600;">Total:</span>
                                    <strong style="font-size: 1.25rem; color: #111827;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(orcamento.totalValue)}</strong>
                                </div>
                            </div>
                        </div>
                        <div style="margin-top: 4rem; padding-top: 1.25rem; border-top: 1px solid #e5e7eb; text-align: center; font-size: 0.75rem; color: #6b7280;">
                            <p>Obrigado pela sua confiança! Este orçamento é válido por ${orcamento.validity} dias a partir da data de emissão.</p>
                        </div>
                    </div>
                `;
    },

    async showOrcamentoPreview(orcamentoId) {
        const htmlContent = await this.preparePdfContent(orcamentoId);
        if (!htmlContent) {
            UI.showToast('Erro ao preparar visualização.', 'error');
            return;
        }

        document.getElementById('pdf-preview-content').innerHTML = htmlContent;
        document.getElementById('downloadPdfBtn').onclick = (e) => this.generatePdf(orcamentoId, e.currentTarget);
        UI.openModal(document.getElementById('orcamentoViewModal'));
    },

    async generatePdf(orcamentoId, buttonElement) {
        const originalText = buttonElement?.innerHTML;
        if (buttonElement) UI.setButtonLoading(buttonElement, true, 'Gerando...');

        const renderTarget = document.getElementById('pdf-render-target');

        try {
            const htmlContent = await this.preparePdfContent(orcamentoId);
            if (!htmlContent) {
                throw new Error("Não foi possível gerar o conteúdo do orçamento.");
            }

            renderTarget.innerHTML = htmlContent;
            await new Promise(resolve => setTimeout(resolve, 100)); // Aguarda renderização

            const canvas = await html2canvas(renderTarget, {
                scale: 2, // Melhora a qualidade da imagem
                useCORS: true // Importante para imagens externas, se houver
            });

            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const ratio = canvasWidth / canvasHeight;
            const imgHeight = pdfWidth / ratio;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight);

            const orcamento = this.state.orcamentos.find(o => o.id === orcamentoId);
            const client = this.state.clients.find(c => c.id === orcamento.clientId);
            const pdfName = `Orçamento_${client.name.replace(/\s+/g, '_')}_${orcamento.id.substring(0, 5)}.pdf`;

            pdf.save(pdfName);

        } catch (error) {
            console.error("Erro ao gerar PDF:", error);
            UI.showToast('Ocorreu um erro ao gerar o PDF.', "error");
        } finally { // UI.setButtonLoading
            renderTarget.innerHTML = '';
            if (buttonElement) {
                this.setButtonLoading(buttonElement, false);
            }
        }
    },

    convertOrcamentoToVenda(orcamentoId) {
        const orcamento = this.state.orcamentos.find(o => o.id === orcamentoId);
        if (!orcamento) {
            UI.showToast('Erro: Orçamento não encontrado.', "error"); // UI.showToast
            return;
        }

        const addSaleModal = document.getElementById('addSaleModal');
        const form = document.getElementById('addSaleForm');

        form.reset();

        form.querySelector('#sourceOrcamentoId').value = orcamentoId;
        form.querySelector('#saleDescription').value = orcamento.title;
        form.querySelector('#saleTotal').value = orcamento.totalValue.toFixed(2);

        const clientSelect = form.querySelector('#clientSelect');
        clientSelect.innerHTML = '';
        this.state.clients.forEach(c => {
            const selected = c.id === orcamento.clientId ? 'selected' : '';
            clientSelect.innerHTML += `<option value="${c.id}" ${selected}>${c.name}</option>`;
        });

        const singleRadio = form.querySelector('input[name="paymentType"][value="single"]');
        const installmentsRadio = form.querySelector('input[name="paymentType"][value="installments"]');
        const singleFields = document.getElementById('singlePaymentFields');
        const installmentsFields = document.getElementById('installmentsFields');

        if (orcamento.paymentType === 'installments') {
            installmentsRadio.checked = true;

            singleFields.classList.add('hidden');
            installmentsFields.classList.remove('hidden');

            form.querySelector('#installmentsCount').value = orcamento.installmentsCount || 2;
            form.querySelector('#firstDueDate').value = orcamento.firstDueDate || new Date().toISOString().split('T')[0];

        } else {
            singleRadio.checked = true;

            installmentsFields.classList.add('hidden');
            singleFields.classList.remove('hidden');

            form.querySelector('#singleDueDate').value = orcamento.singleDueDate || new Date().toISOString().split('T')[0];
        }

        UI.openModal(addSaleModal);
        document.querySelectorAll('[id^="actions-menu-"]').forEach(menu => menu.classList.add('hidden'));
    },

    // =================================================================
    // HELPERS
    // =================================================================
    checkNotifications() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);

        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        this.state.notifications = [];

        this.state.installments.forEach(inst => {
            const client = this.state.clients.find(c => c.id === inst.clientId);
            if (inst.status === 'pending') {
                const dueDate = this.safeParseDate(inst.dueDate);
                if (dueDate < today) {
                    this.state.notifications.push({
                        type: 'overdue',
                        message: `A cobrança de <strong>${client?.name || 'Cliente'}</strong> venceu em ${dueDate.toLocaleDateString('pt-BR')}.`,
                        date: inst.dueDate
                    });
                } else if (inst.dueDate === tomorrowStr) {
                    this.state.notifications.push({
                        type: 'due_soon',
                        message: `A cobrança de <strong>${client?.name || 'Cliente'}</strong> vence amanhã.`,
                        date: inst.dueDate
                    });
                }
            }
        });

        this.state.notifications.sort((a, b) => this.safeParseDate(a.date) - this.safeParseDate(b.date));
    },

    renderNotifications() {
        const badge = document.getElementById('notification-badge');
        const list = document.getElementById('notification-list');
        const panel = document.getElementById('notification-panel');
        const btn = document.getElementById('notificationBtn');
        if (!badge || !list || !panel || !btn) return;

        if (this.state.notifications.length > 0) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        list.innerHTML = '';
        if (this.state.notifications.length === 0) {
            list.innerHTML = `<p class="text-center text-slate-500 text-sm p-4">Nenhuma notificação nova.</p>`;
        } else {
            this.state.notifications.forEach(notif => {
                const icon = notif.type === 'overdue'
                    ? `<span class="material-symbols-outlined text-red-500 mr-3">error</span>`
                    : `<span class="material-symbols-outlined text-yellow-500 mr-3">hourglass_top</span>`;

                list.innerHTML += `
                            <div class="flex items-start p-4 hover:bg-slate-100 border-b border-slate-100 last:border-b-0">
                                ${icon}
                                <p class="text-sm text-slate-700">${notif.message}</p>
                            </div>
                        `;
            });
        }

        btn.onclick = (e) => {
            e.stopPropagation();
            panel.classList.toggle('hidden');
            badge.classList.add('hidden'); // Mark as read
        };
    },

    exportClientsData() {
        const clientsToExport = this.state.selectedClients.length > 0
            ? this.state.clients.filter(client => this.state.selectedClients.includes(client.id))
            : this.state.clients;

        if (clientsToExport.length === 0) { // UI.showToast
            this.showToast("Nenhum cliente para exportar.", "error");
            return;
        }

        const dataToExport = clientsToExport.map(client => {
            const totalInstallments = this.state.installments.filter(inst => inst.clientId === client.id).length;
            return {
                'Nome': client.name,
                'Email': client.email || '',
                'Data de Inclusão': this.safeParseDate(client.createdAt).toLocaleDateString('pt-BR'),
                'Nº de Cobranças': totalInstallments
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Clientes");

        const fileName = this.state.selectedClients.length > 0
            ? "Relatorio_Clientes_Selecionados_ATLAS.xlsx"
            : "Relatorio_Clientes_ATLAS.xlsx";

        XLSX.writeFile(workbook, fileName);
    },

    showClientDetails(clientId) {
        const client = this.state.clients.find(c => c.id === clientId);
        if (!client) return;

        const clientInstallments = this.state.installments
            .filter(i => i.clientId === clientId)
            .sort((a, b) => this.safeParseDate(b.dueDate) - this.safeParseDate(a.dueDate));

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let installmentsHTML = '';
        if (clientInstallments.length > 0) {
            installmentsHTML = clientInstallments.map(inst => {
                const sale = this.state.sales.find(s => s.id === inst.saleId);
                const dueDate = this.safeParseDate(inst.dueDate);
                const isOverdue = inst.status === 'pending' && dueDate < today;
                let statusBadge;
                if (inst.status === 'paid') { statusBadge = `<span class="text-xs font-semibold text-green-800 bg-green-100 px-2.5 py-1 rounded-full">Pago</span>`; }
                else if (isOverdue) { statusBadge = `<span class="text-xs font-semibold text-red-800 bg-red-100 px-2.5 py-1 rounded-full">Vencido</span>`; }
                else { statusBadge = `<span class="text-xs font-semibold text-blue-800 bg-blue-100 px-2.5 py-1 rounded-full">Em Aberto</span>`; }

                return `
                        <div class="grid grid-cols-12 gap-4 items-center p-3 rounded-lg ${inst.status === 'paid' ? 'bg-slate-100' : ''}">
                            <div class="col-span-12 sm:col-span-6 text-sm">
                                <p class="font-medium text-slate-700">${sale?.description || 'N/A'} (${inst.installmentNumber}/${inst.totalInstallments})</p>
                                <p class="text-slate-500">Venc: ${dueDate.toLocaleDateString('pt-BR')}</p>
                            </div>
                            <div class="col-span-6 sm:col-span-3 text-left sm:text-right font-semibold">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}</div>
                            <div class="col-span-6 sm:col-span-3 text-right">${statusBadge}</div>
                        </div>
                        `
            }).join('');
        } else {
            installmentsHTML = '<p class="text-center text-slate-500 py-4">Nenhuma cobrança encontrada para este cliente.</p>';
        }

        const modalContent = document.getElementById('clientDetailModalContent');
        modalContent.innerHTML = `
                    <button class="close-modal-btn absolute top-4 right-4 text-slate-400 hover:text-slate-600"><span class="material-symbols-outlined">close</span></button>
                    <div class="flex items-center mb-6">
                         <div class="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xl mr-4 flex-shrink-0">${client.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}</div>
                         <div>
                            <h2 class="text-2xl font-bold">${client.name}</h2>
                            <p class="text-slate-500">${client.email || 'Sem e-mail'}</p>
                         </div>
                    </div>
                     <p class="text-slate-600 mb-6"><span class="font-semibold">Telefone:</span> ${client.contact || 'Não informado'}</p>

                    <h3 class="font-bold text-lg mb-2">Histórico de Cobranças</h3>
                    <div class="bg-slate-50 rounded-lg p-2 border max-h-80 overflow-y-auto">
                        ${installmentsHTML}
                    </div>
                    <div class="mt-6 pt-6 border-t border-slate-200 flex justify-end">
                        <button id="generateClientPdfBtn" class="bg-indigo-700 text-white px-4 py-2 rounded-lg font-semibold text-sm hover:bg-indigo-800 transition-colors flex items-center gap-2">
                            <span class="material-symbols-outlined text-base">picture_as_pdf</span>
                            Gerar Relatório
                        </button>
                    </div>
                `;
        UI.openModal(document.getElementById('clientDetailModal'));
        modalContent.querySelector('#generateClientPdfBtn').onclick = () => this.generateClientDebtReportPdf(client.id);
    },

    async prepareClientDebtReportContent(clientId) {
        const client = this.state.clients.find(c => c.id === clientId);
        const user = AuthService.currentUser;
        if (!client || !user) return null;

        const getBase64Image = (url) => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataURL = canvas.toDataURL('image/png');
                    resolve(dataURL);
                };
                img.onerror = reject;
                img.src = url;
            });
        };
        const logoBase64 = await getBase64Image('logo_atlas.png').catch(() => null); // UI.showToast

        const clientInstallments = this.state.installments
            .filter(i => i.clientId === clientId)
            .sort((a, b) => this.safeParseDate(a.dueDate) - this.safeParseDate(b.dueDate));

        const today = new Date(); today.setHours(0, 0, 0, 0);
        let totalDue = 0;
        let totalPaid = 0;

        const itemsHtml = clientInstallments.map(inst => {
            const sale = this.state.sales.find(s => s.id === inst.saleId);
            const dueDate = this.safeParseDate(inst.dueDate);
            const isOverdue = inst.status === 'pending' && dueDate < today;

            let statusBadge;
            if (inst.status === 'paid') {
                statusBadge = `<span style="color: #15803d; font-weight: 600;">Pago</span>`;
                totalPaid += inst.value;
            } else if (isOverdue) {
                statusBadge = `<span style="color: #b91c1c; font-weight: 600;">Vencido</span>`;
            } else {
                statusBadge = `<span style="color: #1d4ed8; font-weight: 600;">Em Aberto</span>`;
            }
            totalDue += inst.value;

            return `
                        <tr class="border-b border-slate-200">
                            <td class="py-3 pr-2">${sale?.description || 'N/A'} (${inst.installmentNumber}/${inst.totalInstallments})</td>
                            <td class="py-3 text-center">${dueDate.toLocaleDateString('pt-BR')}</td>
                            <td class="py-3 text-center">${statusBadge}</td>
                            <td class="py-3 text-right">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inst.value)}</td>
                        </tr>
                    `;
        }).join('');

        return `
                    <div style="padding: 40px; font-family: 'Inter', sans-serif; color: #374151;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 1.5rem; border-bottom: 1px solid #e5e7eb;">
                            ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="height: 90px; width: auto;">` : `<span></span>`}
                            <div style="text-align: right;">
                                <h3 style="font-weight: 600; font-size: 1rem;">${user.name || user.displayName}</h3>
                                <p style="font-size: 0.875rem; color: #6b7280;">${user.email}</p>
                            </div>
                        </div>
                        <div style="margin-top: 2.5rem;">
                            <h1 style="font-size: 2.25rem; font-weight: 800; color: #111827;">Extrato do Cliente</h1>
                            <p style="color: #6b7280; margin-top: 0.25rem;">Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div style="margin-top: 2.5rem;">
                            <h3 style="font-size: 0.75rem; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Para</h3>
                            <p style="font-weight: 600; color: #111827;">${client.name}</p>
                            <p style="font-size: 0.875rem; color: #6b7280;">${client.email || ''}</p>
                        </div>
                        <table style="width: 100%; text-align: left; margin-top: 2.5rem; border-collapse: collapse;">
                            <thead>
                                <tr style="color: #4b5563; font-size: 0.875rem; border-bottom: 1px solid #d1d5db;">
                                    <th style="font-weight: 600; padding: 0.75rem 0.5rem;">Descrição</th>
                                    <th style="font-weight: 600; padding: 0.75rem 0.5rem; text-align: center;">Vencimento</th>
                                    <th style="font-weight: 600; padding: 0.75rem 0.5rem; text-align: center;">Status</th>
                                    <th style="font-weight: 600; padding: 0.75rem 0.5rem; text-align: right;">Valor</th>
                                </tr>
                            </thead>
                            <tbody style="font-size: 0.875rem;">
                                ${itemsHtml || `<tr><td colspan="4" style="text-align: center; padding: 2rem;">Nenhuma cobrança encontrada.</td></tr>`}
                            </tbody>
                        </table>
                        <div style="margin-top: 2.5rem; display: flex; justify-content: flex-end;">
                            <div style="width: 320px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.75rem; padding: 1rem; page-break-inside: avoid;">
                                <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; font-size: 0.875rem;"><span style="color: #6b7280;">Total Cobrado:</span> <strong style="color: #374151;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDue)}</strong></div>
                                <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; font-size: 0.875rem;"><span style="color: #6b7280;">Total Pago:</span> <strong style="color: #15803d;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalPaid)}</strong></div>
                                <div style="display: flex; justify-content: space-between; padding: 0.75rem 0; margin-top: 0.5rem; border-top: 1px solid #e5e7eb;"><span style="font-weight: 600;">Saldo Devedor:</span> <strong style="font-size: 1.125rem; color: #b91c1c;">${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalDue - totalPaid)}</strong></div>
                            </div>
                        </div>
                        <div style="margin-top: 4rem; padding-top: 1.25rem; border-top: 1px solid #e2e8f0; text-align: center; font-size: 0.75rem; color: #64748b;">
                            <p>Este é um extrato de cobranças gerado pelo sistema ATLAS.</p>
                        </div>
                    </div>
                `;
    },

    async generateClientDebtReportPdf(clientId) {
        const button = document.getElementById('clientDetailReportBtn');
        const originalText = button?.innerHTML;
        if (button) this.setButtonLoading(button, true, 'Gerando...');

        const renderTarget = document.getElementById('pdf-render-target');

        try {
            const htmlContent = await this.prepareClientDebtReportContent(clientId);
            if (!htmlContent) throw new Error("Conteúdo do relatório não pôde ser gerado.");
            
            renderTarget.innerHTML = htmlContent; // UI.showToast
            await new Promise(resolve => setTimeout(resolve, 100)); // Aguarda renderização

            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

            const client = this.state.clients.find(c => c.id === clientId);
            const pdfName = `Extrato_${client.name.replace(/\s+/g, '_')}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`;

            await pdf.html(renderTarget, {
                margin: [0, 0, 0, 0],
                autoPaging: 'text',
                width: 210,
                windowWidth: 800
            });

            pdf.save(pdfName);

        } catch (error) {
            console.error("Erro ao gerar PDF do cliente:", error);
            UI.showToast('Ocorreu um erro ao gerar o PDF.', "error");
        } finally {
            renderTarget.innerHTML = '';
            if (button) {
                this.setButtonLoading(button, false);
            }
        }
    },

    startOnboarding() {
        const steps = [
            {
                icon: 'waving_hand',
                title: `Bem-vindo(a) ao ATLAS, ${AuthService.currentUser.displayName.split(' ')[0]}!`,
                description: 'Este é o seu novo centro de controlo financeiro. Vamos fazer um tour rápido pelas funcionalidades principais.'
            },
            {
                icon: 'request_quote',
                title: 'Crie Orçamentos Profissionais',
                description: 'Transforme conversas em negócios. Crie e envie propostas detalhadas para os seus clientes em poucos minutos.'
            },
            {
                icon: 'receipt_long',
                title: 'Controle os seus Recebimentos',
                description: 'Converta orçamentos em vendas e acompanhe cada parcela, sabendo exatamente quando e quanto você vai receber.'
            },
            {
                icon: 'shopping_cart',
                title: 'Registe as suas Despesas',
                description: 'Mantenha um registo claro de todas as suas saídas para ter uma visão completa da saúde do seu negócio.'
            },
            {
                icon: 'group_add',
                title: 'Vamos Começar!',
                description: 'O primeiro passo é adicionar o seu primeiro cliente. Preparado(a)?'
            }
        ];
        let currentStep = 0;

        const modal = document.getElementById('onboardingModal');
        const contentEl = document.getElementById('onboarding-content');
        const dotsEl = document.getElementById('onboarding-dots');
        const prevBtn = document.getElementById('prevOnboardingBtn');
        const nextBtn = document.getElementById('nextOnboardingBtn');
        const skipBtn = document.getElementById('skipOnboardingBtn');

        const renderStep = () => {
            contentEl.innerHTML = `
                        <div class="w-16 h-16 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center mx-auto mb-6">
                            <span class="material-symbols-outlined text-4xl">${steps[currentStep].icon}</span>
                        </div>
                        <h2 class="text-2xl font-bold mb-2">${steps[currentStep].title}</h2>
                        <p class="text-slate-600">${steps[currentStep].description}</p>
                    `;
            dotsEl.innerHTML = steps.map((_, i) => `<div class="w-2 h-2 rounded-full ${i === currentStep ? 'bg-indigo-700' : 'bg-slate-300'}"></div>`).join('');
            prevBtn.classList.toggle('hidden', currentStep === 0);
            nextBtn.textContent = currentStep === steps.length - 1 ? 'Cadastrar Cliente' : 'Próximo';
        };

        const completeOnboarding = async () => {
            UI.closeModal(modal);
            await DBService.updateItem('settings', this.state.settings.id, { onboardingCompleted: true });
        };

        nextBtn.onclick = () => {
            if (currentStep < steps.length - 1) {
                currentStep++; 
                renderStep();
            } else {
                completeOnboarding(); // UI.openModal
                UI.openModal(document.getElementById('addClientModal')); // UI.openModal
            }
        };
        prevBtn.onclick = () => { if (currentStep > 0) { currentStep--; renderStep(); } };
        skipBtn.onclick = completeOnboarding;

        renderStep();
        UI.openModal(modal);
    },

    // Funções movidas para ui.js, mas ainda referenciadas em alguns pontos.
    // Mantendo aqui temporariamente para evitar quebras e marcando para remoção.
    closeModal(modal) {
        console.warn("App.closeModal está obsoleto. Use UI.closeModal.");
        UI.closeModal(modal);
    },
    setButtonLoading(button, isLoading, loadingText) {
        console.warn("App.setButtonLoading está obsoleto. Use UI.setButtonLoading.");
        UI.setButtonLoading(button, isLoading, loadingText);
    },
    showToast(message, type) {
        console.warn("App.showToast está obsoleto. Use UI.showToast.");
        UI.showToast(message, type);
    }
};

App.init();