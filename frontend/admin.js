// frontend/admin.js
document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connectBtn');
    const contentArea = document.getElementById('content-area');
    const apiKeyInput = document.getElementById('apiKey');
    const navLinks = document.querySelectorAll('.nav-link');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const uploadBtn = document.getElementById('uploadBtn');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const changePasswordBtn = document.getElementById('change-password-btn');
    
    //const API_BASE_URL = 'http://127.0.0.1:8000'; // Apunta al servidor unificado
    const API_BASE_URL = 'https://cundibotapi-admin.onrender.com';
    connectBtn.addEventListener('click', handleConnect);
    navLinks.forEach(link => link.addEventListener('click', handleNavClick));
    exportCsvBtn.addEventListener('click', downloadCSV);
    uploadBtn.addEventListener('click', uploadAndRegenerate);
    clearLogsBtn.addEventListener('click', clearLogs);
    changePasswordBtn.addEventListener('click', changePassword);

    async function handleConnect() {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) { alert('Por favor, ingresa una clave de API.'); return; }
        const headers = { 'X-Admin-API-Key': apiKey };
        try {
            const response = await fetch(`${API_BASE_URL}/admin/stats`, { headers });
            if (response.status === 401) throw new Error('Clave de API incorrecta o no autorizada.');
            if (!response.ok) throw new Error('No se pudo conectar al servidor.');
            
            contentArea.classList.remove('disabled');
            connectBtn.style.backgroundColor = '#2ecc71';
            connectBtn.innerText = 'Conectado';
            apiKeyInput.disabled = true;
            document.querySelector('.nav-link[data-target="dashboard"]').click();
        } catch (error) {
            alert(`Error de conexión: ${error.message}`);
        }
    }

    function handleNavClick(e) {
        e.preventDefault();
        if (contentArea.classList.contains('disabled')) { alert("Primero debes conectar."); return; }
        const targetId = e.currentTarget.getAttribute('data-target');
        navLinks.forEach(nav => nav.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.querySelectorAll('.content-panel').forEach(panel => panel.classList.remove('active'));
        document.getElementById(targetId).classList.add('active');
        if (targetId === 'dashboard') loadDashboardData();
        if (targetId === 'conversations') loadConversations();
    }
    
    function getAuthHeaders() {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey || apiKeyInput.disabled === false) { alert('La conexión se ha perdido o no se ha establecido.'); return null; }
        return { 'X-Admin-API-Key': apiKey };
    }

    async function fetchData(endpoint, options = {}) {
        const headers = getAuthHeaders();
        if (!headers) return null;
        options.headers = { ...options.headers, ...headers };
        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
            if (response.status === 401) { alert("Clave de API inválida."); location.reload(); return null; }
            if (response.headers.get('content-type')?.includes('text/csv')) return response;
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail || 'Error de red');
            return result;
        } catch (error) {
            alert(`Error en la solicitud: ${error.message}`);
            return null;
        }
    }

    async function loadDashboardData() {
        const stats = await fetchData('/admin/stats');
        if (stats) {
            const container = document.getElementById('stats-grid-container');
            container.innerHTML = `
                <div class="stat-card"><h4>Conversaciones Totales</h4><p>${stats.total_conversations}</p></div>
                <div class="stat-card"><h4>Tokens Totales</h4><p>${stats.total_tokens}</p></div>
                <div class="stat-card"><h4>Costo Total (USD)</h4><p>$${stats.total_cost}</p></div>
                <div class="stat-card"><h4>Uso Modo Normal</h4><p>${stats.normal_mode_count}</p></div>
                <div class="stat-card"><h4>Uso Modo Tutor</h4><p>${stats.tutor_mode_count}</p></div>
            `;
        }
    }

async function loadConversations() {
    const conversations = await fetchData('/admin/conversations');
    if (conversations) {
        const container = document.getElementById('conversations-container');
        let tableHTML = `<table><thead><tr><th>ID Conv.</th><th>Fecha</th><th>Modo</th><th>Pregunta Usuario</th><th>Respuesta</th><th>Tokens</th></tr></thead><tbody>`;
        conversations.forEach(c => {
            // Usamos la columna 'question' que ahora guarda la pregunta limpia
            let cleanQuestion = c.question.startsWith('(MODO:') ? 'N/A (Prompt Dinámico)' : c.question;
            tableHTML += `<tr>
                <td>${c.conversation_id.substring(0, 8)}...</td>
                <td>${new Date(c.timestamp).toLocaleString()}</td>
                <td>${c.mode}</td>
                <td>${cleanQuestion}</td>
                <td>${c.answer.substring(0, 100)}...</td>
                <td>${c.total_tokens}</td>
            </tr>`;
        });
        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }
}
    
    async function clearLogs() {
        if (!confirm('¿Estás seguro de que quieres borrar TODOS los logs? Esta acción es irreversible.')) return;
        const result = await fetchData('/admin/clear-logs', { method: 'DELETE' });
        if(result) {
            alert(result.message);
            loadDashboardData();
            loadConversations();
        }
    }

    async function uploadAndRegenerate() {
        const files = document.getElementById('fileUpload').files;
        const statusDiv = document.getElementById('upload-status');
        if (files.length === 0) { updateStatus(statusDiv, 'Por favor, selecciona al menos un archivo.', 'error'); return; }
        const formData = new FormData();
        for (const file of files) { formData.append('files', file); }
        updateStatus(statusDiv, 'Subiendo y procesando... Esto puede tardar varios minutos.', '');
        const headers = getAuthHeaders();
        if (!headers) return;
        try {
            const response = await fetch(`${API_BASE_URL}/admin/upload-and-regenerate`, { method: 'POST', headers: headers, body: formData });
            const result = await response.json();
            if (!response.ok) throw new Error(result.detail);
            updateStatus(statusDiv, result.message, 'success');
        } catch (error) {
            updateStatus(statusDiv, `Error: ${error.message}`, 'error');
        }
    }
    
    async function downloadCSV() {
    // La URL debe coincidir exactamente con el endpoint que definimos en el backend
    const endpoint = '/admin/conversations/csv';

    const headers = getAuthHeaders();
    if (!headers) return;

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, { headers });
        if (!response.ok) {
            throw new Error('Error al generar el reporte desde el servidor.');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const disposition = response.headers.get('content-disposition');
        let filename = 'reporte_conversaciones.csv';
        if (disposition && disposition.includes('attachment')) {
            const matches = /filename="([^"]+)"/.exec(disposition);
            if (matches && matches[1]) {
                filename = matches[1];
            }
        }
        a.download = filename;
        
        document.body.appendChild(a);
        a.click();
        
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

    } catch (error) {
        alert(`Error: ${error.message}`);
        console.error("Error al descargar CSV:", error);
    }
}

    async function changePassword() {
        const newPassword = document.getElementById('new-password').value;
        const statusDiv = document.getElementById('password-status');
        const oldPassword = apiKeyInput.value.trim();

        if (!newPassword) { updateStatus(statusDiv, 'La nueva contraseña no puede estar vacía.', 'error'); return; }
        if (!oldPassword) { alert("Error: No se ha establecido una conexión."); return; }
        
        updateStatus(statusDiv, 'Cambiando contraseña...', '');
        const result = await fetchData('/admin/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Admin-API-Key': oldPassword },
            body: JSON.stringify({ new_password: newPassword })
        });
        if (result) {
            updateStatus(statusDiv, result.message + " La página se recargará y deberás conectar con la nueva clave.", 'success');
            setTimeout(() => { location.reload(); }, 2500);
        }
    }

    function updateStatus(element, message, type) {
        element.textContent = message;
        element.className = `status ${type} active`;
    }
});