export async function wait(delay: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function waitFor(callback: () => Promise<boolean>, maxAttempts = 120, delay = 3000): Promise<void> {
    let attempts = 0;
    while (attempts < maxAttempts) {
        const result = await callback();
        if (result) {
            return;
        }
        attempts++;
        await wait(delay);
    }
    throw new Error("Waited for too long, something is up!");
}
