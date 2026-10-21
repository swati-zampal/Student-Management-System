
document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('#loginForm');
    const error = document.querySelector('#loginError');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        error.textContent = '';

        const data = Object.fromEntries(new FormData(form).entries());

        try {
            const response = await fetch('/api/index.php?action=login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Sign in failed');
            }

            location.href = '/index.html';
        } catch (err) {
            error.textContent = err.message || 'Unable to connect to server';
        }
    });
});
