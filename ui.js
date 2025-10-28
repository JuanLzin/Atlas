export const UI = {
    openModal(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => {
            modal.style.opacity = '1';
            modal.querySelector('.modal-content').style.transform = 'scale(1)';
        }, 10);
    },
    closeModal(modal) {
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
            const sourceOrcamentoIdInput = form.querySelector('#sourceOrcamentoId');
            if (sourceOrcamentoIdInput) {
                sourceOrcamentoIdInput.value = '';
            }
        }
        modal.style.opacity = '0'; modal.querySelector('.modal-content').style.transform = 'scale(0.95)';
        setTimeout(() => { modal.classList.add('hidden'); modal.classList.remove('flex'); }, 300);
    },

    openConfirmationModal(title, message, onConfirm, isDestructive = true) {
        const modal = document.getElementById('confirmModal');
        modal.querySelector('#confirmTitle').textContent = title;
        modal.querySelector('#confirmMessage').innerHTML = message;

        const confirmBtn = document.getElementById('confirmActionBtn');
        if (isDestructive) {
            confirmBtn.className = 'bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors';
            confirmBtn.textContent = 'Apagar';
        } else {
            confirmBtn.className = 'bg-indigo-700 text-white px-6 py-2 rounded-lg font-semibold hover:bg-indigo-800 transition-colors';
            confirmBtn.textContent = 'Ok';
        }

        // Clone the button to remove all previous event listeners
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        newConfirmBtn.addEventListener('click', () => {
            onConfirm();
            this.closeModal(modal);
        });

        modal.querySelector('#cancelConfirmBtn').onclick = () => this.closeModal(modal);
        modal.querySelector('.close-modal-btn').onclick = () => this.closeModal(modal);

        this.openModal(modal);
    },

    setButtonLoading(button, isLoading, loadingText = "A gravar...") {
        if (isLoading) { // Inicia o carregamento
            button.disabled = true;
            button.classList.add('btn-disabled');
            button.dataset.originalText = button.innerHTML;
            const spinnerColor = button.classList.contains('bg-white') ? 'text-indigo-700' : 'text-white';
            button.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 ${spinnerColor} inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${loadingText}`;
        } else { // Finaliza o carregamento
            button.disabled = false;
            button.classList.remove('btn-disabled');
            // Restaura o texto original que foi guardado
            button.innerHTML = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    },
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
};