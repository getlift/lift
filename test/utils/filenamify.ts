const invalidCharacters = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);

const filenamify = (filename: string): string =>
    filename
        .split("")
        .map((character) => (invalidCharacters.has(character) || character.charCodeAt(0) < 32 ? "!" : character))
        .join("");

export default filenamify;
