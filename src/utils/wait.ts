export async function wait(delay: number) {
    return new Promise(resolve => setTimeout(resolve, delay));
}

export async function waitFor(callback: () => Promise<boolean>, maxAttempts = 120, delay = 3000) {
    let attempts = 0;
    while (attempts < maxAttempts) {
        const result = await callback();
        if (result) {
            return;
        }
        attempts++;
        await wait(delay)
    }
    throw new Error('Waited for too long, something is up!')
}
