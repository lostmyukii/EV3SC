/* eslint-disable arrow-parens */
const ERROR_CORRECTION_LEVEL = 1; // QR level L.
const MAX_QR_VERSION = 10;
const PAD_BYTES = [0xec, 0x11];

const ALIGNMENT_PATTERN_CENTERS = [
    [],
    [6, 18],
    [6, 22],
    [6, 26],
    [6, 30],
    [6, 34],
    [6, 22, 38],
    [6, 24, 42],
    [6, 26, 46],
    [6, 28, 50]
];

const RS_BLOCKS_L = [
    [[1, 26, 19]],
    [[1, 44, 34]],
    [[1, 70, 55]],
    [[1, 100, 80]],
    [[1, 134, 108]],
    [[2, 86, 68]],
    [[2, 98, 78]],
    [[2, 121, 97]],
    [[2, 146, 116]],
    [[2, 86, 68], [2, 87, 69]]
];

const encodeUtf8 = value => {
    const bytes = [];
    Array.from(String(value || '')).forEach(character => {
        const codePoint = character.codePointAt(0);
        if (codePoint < 0x80) {
            bytes.push(codePoint);
        } else if (codePoint < 0x800) {
            bytes.push(0xc0 | (codePoint >> 6));
            bytes.push(0x80 | (codePoint & 0x3f));
        } else if (codePoint < 0x10000) {
            bytes.push(0xe0 | (codePoint >> 12));
            bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
            bytes.push(0x80 | (codePoint & 0x3f));
        } else {
            bytes.push(0xf0 | (codePoint >> 18));
            bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
            bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
            bytes.push(0x80 | (codePoint & 0x3f));
        }
    });
    return bytes;
};

const byteLength = value => encodeUtf8(value).length;

const escapeXmlText = value => String(value || '').replace(/[&<>]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
}[character]));

const createEmptyMatrix = size => ({
    modules: Array.from({
        length: size
    }, () => Array(size).fill(false)),
    reserved: Array.from({
        length: size
    }, () => Array(size).fill(false))
});

const setModule = ({
    dark,
    matrix,
    reserved = true,
    x,
    y
}) => {
    if (x < 0 || y < 0 || y >= matrix.modules.length || x >= matrix.modules.length) return;
    matrix.modules[y][x] = Boolean(dark);
    if (reserved) matrix.reserved[y][x] = true;
};

const addFinderPattern = (matrix, originX, originY) => {
    for (let y = -1; y <= 7; y++) {
        for (let x = -1; x <= 7; x++) {
            const absoluteX = originX + x;
            const absoluteY = originY + y;
            const dark = x >= 0 && x <= 6 && y >= 0 && y <= 6 &&
                (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
            setModule({
                dark,
                matrix,
                x: absoluteX,
                y: absoluteY
            });
        }
    }
};

const addAlignmentPattern = (matrix, centerX, centerY) => {
    for (let y = -2; y <= 2; y++) {
        for (let x = -2; x <= 2; x++) {
            setModule({
                dark: Math.max(Math.abs(x), Math.abs(y)) !== 1,
                matrix,
                x: centerX + x,
                y: centerY + y
            });
        }
    }
};

const addFunctionPatterns = (matrix, version) => {
    const size = matrix.modules.length;
    addFinderPattern(matrix, 0, 0);
    addFinderPattern(matrix, size - 7, 0);
    addFinderPattern(matrix, 0, size - 7);

    for (let index = 8; index < size - 8; index++) {
        const dark = index % 2 === 0;
        setModule({
            dark,
            matrix,
            x: index,
            y: 6
        });
        setModule({
            dark,
            matrix,
            x: 6,
            y: index
        });
    }

    ALIGNMENT_PATTERN_CENTERS[version - 1].forEach(centerY => {
        ALIGNMENT_PATTERN_CENTERS[version - 1].forEach(centerX => {
            const overlapsFinder = (centerX < 9 && centerY < 9) ||
                (centerX > size - 10 && centerY < 9) ||
                (centerX < 9 && centerY > size - 10);
            if (!overlapsFinder) addAlignmentPattern(matrix, centerX, centerY);
        });
    });

    setModule({
        dark: true,
        matrix,
        x: 8,
        y: size - 8
    });
};

const createBitBuffer = () => {
    const bits = [];
    return {
        add: (value, length) => {
            for (let index = length - 1; index >= 0; index--) {
                bits.push(((value >>> index) & 1) === 1);
            }
        },
        bits,
        get length () {
            return bits.length;
        }
    };
};

const getBlocksForVersion = version => RS_BLOCKS_L[version - 1]
    .reduce((blocks, group) => {
        for (let index = 0; index < group[0]; index++) {
            blocks.push({
                dataCodewords: group[2],
                totalCodewords: group[1]
            });
        }
        return blocks;
    }, []);

const getDataCapacity = version => getBlocksForVersion(version)
    .reduce((total, block) => total + block.dataCodewords, 0);

const chooseVersion = bytes => {
    for (let version = 1; version <= MAX_QR_VERSION; version++) {
        const countBits = version < 10 ? 8 : 16;
        const requiredBits = 4 + countBits + (bytes.length * 8);
        if (requiredBits <= getDataCapacity(version) * 8) return version;
    }
    throw new Error('QR payload is too large.');
};

const createDataCodewords = ({
    bytes,
    version
}) => {
    const buffer = createBitBuffer();
    const dataCapacity = getDataCapacity(version);
    const dataCapacityBits = dataCapacity * 8;
    buffer.add(0x4, 4);
    buffer.add(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach(byte => buffer.add(byte, 8));
    buffer.add(0, Math.min(4, dataCapacityBits - buffer.length));
    while (buffer.length % 8 !== 0) buffer.add(0, 1);

    const codewords = [];
    for (let index = 0; index < buffer.bits.length; index += 8) {
        let byte = 0;
        for (let offset = 0; offset < 8; offset++) {
            byte = (byte << 1) | (buffer.bits[index + offset] ? 1 : 0);
        }
        codewords.push(byte);
    }

    let padIndex = 0;
    while (codewords.length < dataCapacity) {
        codewords.push(PAD_BYTES[padIndex % PAD_BYTES.length]);
        padIndex++;
    }
    return codewords;
};

const createGaloisTables = () => {
    const exp = Array(512).fill(0);
    const log = Array(256).fill(0);
    let value = 1;
    for (let index = 0; index < 255; index++) {
        exp[index] = value;
        log[value] = index;
        value <<= 1;
        if (value & 0x100) value ^= 0x11d;
    }
    for (let index = 255; index < exp.length; index++) {
        exp[index] = exp[index - 255];
    }
    return {
        exp,
        log
    };
};

const GALOIS = createGaloisTables();

const gfMultiply = (left, right) => {
    if (left === 0 || right === 0) return 0;
    return GALOIS.exp[GALOIS.log[left] + GALOIS.log[right]];
};

const multiplyPolynomials = (left, right) => {
    const result = Array(left.length + right.length - 1).fill(0);
    left.forEach((leftValue, leftIndex) => {
        right.forEach((rightValue, rightIndex) => {
            result[leftIndex + rightIndex] ^= gfMultiply(leftValue, rightValue);
        });
    });
    return result;
};

const createGeneratorPolynomial = degree => {
    let polynomial = [1];
    for (let index = 0; index < degree; index++) {
        polynomial = multiplyPolynomials(polynomial, [1, GALOIS.exp[index]]);
    }
    return polynomial;
};

const createErrorCorrectionCodewords = ({
    dataCodewords,
    errorCodewordCount
}) => {
    const generator = createGeneratorPolynomial(errorCodewordCount);
    const remainder = dataCodewords.slice().concat(Array(errorCodewordCount).fill(0));
    for (let index = 0; index < dataCodewords.length; index++) {
        const factor = remainder[index];
        if (factor === 0) continue;
        generator.forEach((coefficient, generatorIndex) => {
            remainder[index + generatorIndex] ^= gfMultiply(coefficient, factor);
        });
    }
    return remainder.slice(dataCodewords.length);
};

const createFinalCodewords = ({
    dataCodewords,
    version
}) => {
    const blocks = getBlocksForVersion(version);
    const blockData = [];
    let offset = 0;
    blocks.forEach(block => {
        const data = dataCodewords.slice(offset, offset + block.dataCodewords);
        const errorCodewordCount = block.totalCodewords - block.dataCodewords;
        blockData.push({
            data,
            ec: createErrorCorrectionCodewords({
                dataCodewords: data,
                errorCodewordCount
            })
        });
        offset += block.dataCodewords;
    });

    const finalCodewords = [];
    const maxDataLength = Math.max(...blockData.map(block => block.data.length));
    for (let index = 0; index < maxDataLength; index++) {
        blockData.forEach(block => {
            if (index < block.data.length) finalCodewords.push(block.data[index]);
        });
    }

    const maxEcLength = Math.max(...blockData.map(block => block.ec.length));
    for (let index = 0; index < maxEcLength; index++) {
        blockData.forEach(block => {
            if (index < block.ec.length) finalCodewords.push(block.ec[index]);
        });
    }
    return finalCodewords;
};

const getMaskBit = (mask, x, y) => {
    switch (mask) {
    case 0:
        return (x + y) % 2 === 0;
    case 1:
        return y % 2 === 0;
    case 2:
        return x % 3 === 0;
    case 3:
        return (x + y) % 3 === 0;
    case 4:
        return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
        return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
        return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
        return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
        return false;
    }
};

const cloneMatrix = matrix => ({
    modules: matrix.modules.map(row => row.slice()),
    reserved: matrix.reserved.map(row => row.slice())
});

const placeData = ({
    codewords,
    mask,
    matrix
}) => {
    const bits = [];
    codewords.forEach(codeword => {
        for (let bit = 7; bit >= 0; bit--) {
            bits.push(((codeword >>> bit) & 1) === 1);
        }
    });

    const size = matrix.modules.length;
    let bitIndex = 0;
    let direction = -1;
    let y = size - 1;

    for (let x = size - 1; x > 0; x -= 2) {
        if (x === 6) x--;
        for (;;) {
            for (let offset = 0; offset < 2; offset++) {
                const column = x - offset;
                if (!matrix.reserved[y][column]) {
                    const bit = bitIndex < bits.length ? bits[bitIndex] : false;
                    matrix.modules[y][column] = bit !== getMaskBit(mask, column, y);
                    bitIndex++;
                }
            }
            y += direction;
            if (y < 0 || y >= size) {
                y -= direction;
                direction = -direction;
                break;
            }
        }
    }
};

const getBchDigit = value => {
    let digit = 0;
    while (value !== 0) {
        digit++;
        value >>>= 1;
    }
    return digit;
};

const createBchTypeInfo = data => {
    let value = data << 10;
    const generator = 0b10100110111;
    while (getBchDigit(value) - getBchDigit(generator) >= 0) {
        value ^= generator << (getBchDigit(value) - getBchDigit(generator));
    }
    return ((data << 10) | value) ^ 0b101010000010010;
};

const createBchVersion = version => {
    let value = version << 12;
    const generator = 0b1111100100101;
    while (getBchDigit(value) - getBchDigit(generator) >= 0) {
        value ^= generator << (getBchDigit(value) - getBchDigit(generator));
    }
    return (version << 12) | value;
};

const addFormatInformation = ({
    mask,
    matrix
}) => {
    const bits = createBchTypeInfo((ERROR_CORRECTION_LEVEL << 3) | mask);
    const size = matrix.modules.length;
    for (let index = 0; index < 15; index++) {
        const dark = ((bits >>> index) & 1) === 1;
        if (index < 6) {
            setModule({
                dark,
                matrix,
                x: 8,
                y: index
            });
        } else if (index < 8) {
            setModule({
                dark,
                matrix,
                x: 8,
                y: index + 1
            });
        } else {
            setModule({
                dark,
                matrix,
                x: 8,
                y: size - 15 + index
            });
        }

        if (index < 8) {
            setModule({
                dark,
                matrix,
                x: size - index - 1,
                y: 8
            });
        } else if (index < 9) {
            setModule({
                dark,
                matrix,
                x: 15 - index,
                y: 8
            });
        } else {
            setModule({
                dark,
                matrix,
                x: 14 - index,
                y: 8
            });
        }
    }
    setModule({
        dark: true,
        matrix,
        x: 8,
        y: size - 8
    });
};

const addVersionInformation = ({
    matrix,
    version
}) => {
    if (version < 7) return;
    const bits = createBchVersion(version);
    const size = matrix.modules.length;
    for (let index = 0; index < 18; index++) {
        const dark = ((bits >>> index) & 1) === 1;
        setModule({
            dark,
            matrix,
            x: size - 11 + (index % 3),
            y: Math.floor(index / 3)
        });
        setModule({
            dark,
            matrix,
            x: Math.floor(index / 3),
            y: size - 11 + (index % 3)
        });
    }
};

const countPenaltyRuns = lines => lines.reduce((penalty, line) => {
    let runColor = line[0];
    let runLength = 1;
    for (let index = 1; index < line.length; index++) {
        if (line[index] === runColor) {
            runLength++;
        } else {
            if (runLength >= 5) penalty += 3 + (runLength - 5);
            runColor = line[index];
            runLength = 1;
        }
    }
    if (runLength >= 5) penalty += 3 + (runLength - 5);
    return penalty;
}, 0);

const getColumns = modules => modules.map((row, columnIndex) => modules.map(columnRow => columnRow[columnIndex]));

const matchesFinderPenalty = line => {
    const patterns = [
        [true, false, true, true, true, false, true, false, false, false, false],
        [false, false, false, false, true, false, true, true, true, false, true]
    ];
    let matches = 0;
    for (let index = 0; index <= line.length - 11; index++) {
        if (patterns.some(pattern => pattern.every((value, offset) => line[index + offset] === value))) {
            matches++;
        }
    }
    return matches * 40;
};

const calculatePenalty = modules => {
    const size = modules.length;
    let penalty = countPenaltyRuns(modules) + countPenaltyRuns(getColumns(modules));

    for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
            const color = modules[y][x];
            if (
                modules[y][x + 1] === color &&
                modules[y + 1][x] === color &&
                modules[y + 1][x + 1] === color
            ) {
                penalty += 3;
            }
        }
    }

    modules.forEach(row => {
        penalty += matchesFinderPenalty(row);
    });
    getColumns(modules).forEach(column => {
        penalty += matchesFinderPenalty(column);
    });

    const darkCount = modules.reduce((total, row) => total + row.filter(Boolean).length, 0);
    const totalModules = size * size;
    penalty += Math.floor(Math.abs((darkCount * 20) - (totalModules * 10)) / totalModules) * 10;
    return penalty;
};

const createQrCodeMatrix = text => {
    const bytes = encodeUtf8(text);
    const version = chooseVersion(bytes);
    const size = 21 + ((version - 1) * 4);
    const baseMatrix = createEmptyMatrix(size);
    addFunctionPatterns(baseMatrix, version);
    addVersionInformation({
        matrix: baseMatrix,
        version
    });
    const dataCodewords = createDataCodewords({
        bytes,
        version
    });
    const codewords = createFinalCodewords({
        dataCodewords,
        version
    });

    let bestMatrix = null;
    let bestPenalty = Infinity;
    let bestMask = 0;
    for (let mask = 0; mask < 8; mask++) {
        const matrix = cloneMatrix(baseMatrix);
        placeData({
            codewords,
            mask,
            matrix
        });
        addFormatInformation({
            mask,
            matrix
        });
        const penalty = calculatePenalty(matrix.modules);
        if (penalty < bestPenalty) {
            bestMatrix = matrix;
            bestPenalty = penalty;
            bestMask = mask;
        }
    }

    return {
        byteLength: bytes.length,
        mask: bestMask,
        modules: bestMatrix.modules,
        size,
        version
    };
};

const createQrCodeSvg = ({
    cellSize = 6,
    quietZone = 4,
    title = 'Release QR code',
    url
} = {}) => {
    const matrix = createQrCodeMatrix(url || '');
    const totalCells = matrix.size + (quietZone * 2);
    const size = totalCells * cellSize;
    const cells = [];
    matrix.modules.forEach((row, y) => {
        row.forEach((dark, x) => {
            if (!dark) return;
            cells.push(
                `<rect x="${(x + quietZone) * cellSize}" y="${(y + quietZone) * cellSize}" ` +
                `width="${cellSize}" height="${cellSize}"/>`
            );
        });
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" role="img" viewBox="0 0 ${size} ${size}" ` +
        `width="${size}" height="${size}" data-qr-version="${matrix.version}" ` +
        `data-qr-mask="${matrix.mask}" data-qr-bytes="${matrix.byteLength}"><title>${escapeXmlText(title)}</title>` +
        `<rect width="${size}" height="${size}" fill="#fff"/>${cells.join('')}</svg>`;
};

export {
    byteLength,
    createQrCodeMatrix,
    createQrCodeSvg
};
