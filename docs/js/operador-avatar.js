(() => {
    const form = document.getElementById('operator-avatar-form');
    const input = document.getElementById('operator-avatar-file');
    const button = document.getElementById('operator-avatar-upload');
    const preview = document.getElementById('operator-avatar-preview');
    const status = document.getElementById('operator-avatar-status');
    if (!form || !input || !button || !preview || !status) return;
    let prepared = null, previewUrl = null, generation = 0, uploading = false;

    input.addEventListener('change', async () => {
        const current = ++generation;
        prepared = null;
        button.disabled = true;
        preview.hidden = true;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        const file = input.files?.[0];
        if (!file) { status.textContent = ''; return; }
        status.textContent = 'PREPARANDO FOTO...';
        try {
            if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Escolha uma foto PNG, JPG ou WebP.');
            if (file.size > 8 * 1024 * 1024) throw new Error('Escolha uma foto de até 8 MB.');
            const image = await createImageBitmap(file);
            let blob;
            try {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 256;
                const context = canvas.getContext('2d');
                const side = Math.min(image.width, image.height);
                context.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, 256, 256);
                blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.84));
            } finally { image.close(); }
            if (current !== generation) return;
            if (!blob || blob.type !== 'image/webp' || blob.size > 128 * 1024) throw new Error('Não foi possível preparar esta imagem. Escolha outra foto.');
            prepared = blob;
            previewUrl = URL.createObjectURL(blob);
            preview.src = previewUrl;
            preview.hidden = false;
            button.disabled = false;
            status.textContent = 'PRÉVIA PRONTA // CLIQUE EM SALVAR MINHA FOTO.';
        } catch (error) {
            if (current === generation) status.textContent = error.message || 'Não foi possível abrir a imagem.';
        }
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!prepared || uploading) return;
        uploading = true;
        input.disabled = button.disabled = true;
        status.textContent = 'SALVANDO SUA FOTO...';
        try {
            const token = window.shredderAccount?.snapshot().token;
            const response = await fetch('/api/operador/avatar', {
                method: 'POST',
                headers: { 'Content-Type': 'image/webp', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: prepared,
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.avatar) throw new Error(payload.error || payload.erro || 'Não foi possível salvar sua foto.');
            preview.src = shredderAvatarUrl(payload.avatar);
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = null;
            prepared = null;
            input.value = '';
            window.shredderAccount?.notify();
            status.textContent = 'FOTO ATUALIZADA. Se estiver editando seu perfil abaixo, carregue-o novamente antes de salvar.';
        } catch (error) {
            status.textContent = error.message || 'Falha no envio. Sua foto continua disponível para tentar novamente.';
        } finally {
            uploading = false;
            input.disabled = false;
            button.disabled = !prepared;
        }
    });
})();
