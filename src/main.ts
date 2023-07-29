const canvas = document.getElementById("game") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// TODO: win condition check algo
// TODO: online multiplayer

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

const minZoom = 0.4;
const maxZoom = 4;
const camera = { x: 0, y: 0, zoom: 1 };

const keysPressed = new Set<string>();
window.addEventListener("keydown", (e) => keysPressed.add(e.key));
window.addEventListener("keyup", (e) => keysPressed.delete(e.key));

function keyboardControls(mod: number) {
    const baseSpeed = 10;
    let speed = baseSpeed * mod * (1 / camera.zoom);
    if (
        +keysPressed.has("ArrowUp") ^
        (+keysPressed.has("ArrowDown") & +keysPressed.has("ArrowLeft")) ^
        +keysPressed.has("ArrowRight")
    ) {
        speed /= Math.SQRT2;
    }
    if (keysPressed.has("ArrowUp")) camera.y -= speed;
    if (keysPressed.has("ArrowDown")) camera.y += speed;
    if (keysPressed.has("ArrowLeft")) camera.x -= speed;
    if (keysPressed.has("ArrowRight")) camera.x += speed;
    if (keysPressed.has("PageUp")) camera.zoom = Math.min(maxZoom, camera.zoom * 1.1);
    if (keysPressed.has("PageDown")) camera.zoom = Math.max(minZoom, camera.zoom / 1.1);
}

let mouseDown = false;
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("mousedown", (e) => {
    if (e.button === 2) mouseDown = true;
});
canvas.addEventListener("mouseup", (e) => {
    if (e.button === 2) mouseDown = false;
});
function mouseControls(e: MouseEvent) {
    if (mouseDown) {
        camera.x -= e.movementX / camera.zoom;
        camera.y -= e.movementY / camera.zoom;
    }
}
window.addEventListener("wheel", (e) => {
    const zoomFactor = 1 - e.deltaY / 1000;
    if (camera.zoom * zoomFactor < minZoom || camera.zoom * zoomFactor > maxZoom) return;
    const oldMouse = mouseToGame(e);
    camera.zoom *= zoomFactor;
    const newMouse = mouseToGame(e);
    camera.x += oldMouse.x - newMouse.x;
    camera.y += oldMouse.y - newMouse.y;
});

function translateCoords({ x, y }: Point): [number, number] {
    return [
        x * camera.zoom - camera.x * camera.zoom + canvas.width * 0.5,
        y * camera.zoom - camera.y * camera.zoom + canvas.height * 0.5,
    ];
}

function translateCoordsPoint(p: Point): Point {
    const [x, y] = translateCoords(p);
    return { x, y };
}

function translateDimensions(width: number, height: number): [number, number] {
    return [width * camera.zoom, height * camera.zoom];
}

function mouseToGame(e: MouseEvent) {
    return {
        x: (e.clientX - canvas.width * 0.5) / camera.zoom + camera.x,
        y: (e.clientY - canvas.height * 0.5) / camera.zoom + camera.y,
    };
}

const phases = [
    {
        player: 1,
        type: "start",
        title: "Player 1, choose a dot",
    },
    {
        player: 1,
        type: "draw",
        title: "Player 1, draw a line to a dot",
    },
    {
        player: 1,
        type: "new",
        title: "Player 1, create a new dot",
    },
    {
        player: 2,
        type: "start",
        title: "Player 2, choose a dot",
    },
    {
        player: 2,
        type: "draw",
        title: "Player 2, draw a line to a dot",
    },
    {
        player: 2,
        type: "new",
        title: "Player 2, create a new dot",
    },
] as const;

let phase = 0;

type Point = { x: number; y: number };
type Line = Point[];
type Dot = Point & { count: number };

const lines: Line[] = [];

const minDots = 2;
const maxDots = 10;
const windowDotAmount = window.location.search ? parseInt(window.location.search.slice(1)) : 3;
const startingDotAmount = Number.isNaN(windowDotAmount)
    ? minDots
    : Math.max(minDots, Math.min(maxDots, windowDotAmount));

const dots: Dot[] = [];

const dotXSpread = 200;
const dotYSpread = 100 * startingDotAmount;
for (let i = 0; i < startingDotAmount; i++) {
    dots.push({
        x: (i - (startingDotAmount - 1) / 2) * dotXSpread,
        y: Math.floor((dotYSpread * 2 + 1) * Math.random()) - dotYSpread,
        count: 0,
    });
}

const lineWidth = 4;
const dotRadius = 8;
const clickMultiplier = 1.5;

let currentDot: Dot | null = null;
let currentDot2: Dot | null = null;
let closestPoint: Point | null = null;
let currentLine: Line | null = [];

function failDraw() {
    currentDot = null;
    currentLine = null;
    phase--;
}

function straightLineIntersect(line: [Point, Point], otherLine: [Point, Point]) {
    const [a, b] = line;
    const [c, d] = otherLine;
    const denominator = (b.y - a.y) * (d.x - c.x) - (a.x - b.x) * (c.y - d.y);
    if (denominator === 0) return false;
    const t = ((a.x - c.x) * (d.y - c.y) - (a.y - c.y) * (d.x - c.x)) / denominator;
    const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / denominator;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

function doesStraighLineIntersectComplexLine(line: [Point, Point], otherLine: Line) {
    for (let i = 0; i < otherLine.length - 1; i++) {
        if (straightLineIntersect(line, [otherLine[i], otherLine[i + 1]])) return true;
    }
    return false;
}

function distanceBetweenPoints(a: Point, b: Point) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function closesPointOnLineSegment(point: Point, line: [Point, Point]): Point {
    const [a, b] = line;
    const ab = { x: b.x - a.x, y: b.y - a.y };
    const ap = { x: point.x - a.x, y: point.y - a.y };
    const ab2 = ab.x * ab.x + ab.y * ab.y;
    const ap_ab = ap.x * ab.x + ap.y * ab.y;
    const t = ap_ab / ab2;
    if (t < 0) return a;
    if (t > 1) return b;
    return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

function closestPointOnLine(point: Point, line: Line): Point {
    let currentClosest: Point | null = null;
    let closestDistance = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
        const newClosestPoint = closesPointOnLineSegment(point, [line[i], line[i + 1]]);
        const newClosestDistance = distanceBetweenPoints(point, newClosestPoint);
        if (newClosestDistance < closestDistance) {
            currentClosest = newClosestPoint;
            closestDistance = newClosestDistance;
        }
    }
    return currentClosest!;
}

const minDistanceFromExistingPoints = dotRadius * 4;

canvas.addEventListener("click", (e) => {
    const currentPhase = phases[phase];
    if (currentPhase.type === "draw") return;
    if (currentPhase.type === "start") {
        const coords = mouseToGame(e);
        const dot = dots.find(
            (dot) => distanceBetweenPoints(dot, coords) < dotRadius * clickMultiplier
        );
        if (!dot || dot.count >= 3) return;
        currentDot = dot;
        currentLine = [{ x: dot.x, y: dot.y }];
        phase++;
    } else if (currentPhase.type === "new") {
        const coords = mouseToGame(e);
        const newDotPoint = closestPointOnLine(coords, currentLine!);
        if (dots.some((d) => distanceBetweenPoints(d, newDotPoint) < minDistanceFromExistingPoints))
            return;
        dots.push({
            ...newDotPoint,
            count: 2,
        });
        lines.push(currentLine!);
        currentDot = null;
        currentDot2 = null;
        closestPoint = null;
        currentLine = null;
        phase = (phase + 1) % phases.length;
    }
});

const lineSegmentDistance = 5;

const lineColor = "#181825";
const dotColor = "#585b70";
const p1 = "#f38ba8";
const p2 = "#89b4fa";
const newDotColor = "#cba6f7";

window.addEventListener("mousemove", (e) => {
    mouseControls(e);
    const currentPhase = phases[phase];
    if (currentPhase.type === "start") return;
    if (currentPhase.type === "draw") {
        const newPoint = mouseToGame(e);
        const dot = dots.find(
            (dot) => distanceBetweenPoints(dot, newPoint) < dotRadius * clickMultiplier
        );
        if (dot) {
            if (dot.count >= 3) return failDraw();
            if (
                currentDot === dot &&
                (currentLine!.length - 1) * lineSegmentDistance < dotRadius * 2
            )
                return;
            if (currentDot === dot && dot.count >= 2) return failDraw();
            dot.count++;
            currentDot!.count++;
            currentLine!.push({ x: dot.x, y: dot.y });
            currentDot2 = dot;
            phase++;
            return;
        }
        const lastPoint = currentLine!.at(-1)!;
        if (distanceBetweenPoints(newPoint, lastPoint) < lineSegmentDistance) return;
        if (doesStraighLineIntersectComplexLine([lastPoint, newPoint], currentLine!))
            return failDraw();
        if (
            currentLine!.length > 1 &&
            lines.some((otherLine) =>
                doesStraighLineIntersectComplexLine([lastPoint, newPoint], otherLine)
            )
        )
            return failDraw();
        currentLine!.push(newPoint);
    } else if (currentPhase.type === "new") {
        closestPoint = closestPointOnLine(mouseToGame(e), currentLine!);
    }
});

canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 2 || phases[phase].type !== "draw") return;
    failDraw();
});

const bezierMagicValue = 8;

let lastFrame = Date.now();
function draw() {
    const now = Date.now();
    const delta = now - lastFrame;
    const mod = delta / (1000 / 60);
    lastFrame = now;

    keyboardControls(mod);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const line of lines) {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 5 * camera.zoom;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(...translateCoords(line[0]));
        for (let i = 0; i < line.length - 1; i += 1) {
            const p0 = i > 0 ? translateCoordsPoint(line[i - 1]) : translateCoordsPoint(line[0]);
            const p1 = translateCoordsPoint(line[i]);
            const p2 = translateCoordsPoint(line[i + 1]);
            const p3 = i !== line.length - 2 ? translateCoordsPoint(line[i + 2]) : p2;
            const cp1x = p1.x + (p2.x - p0.x) / bezierMagicValue;
            const cp1y = p1.y + (p2.y - p0.y) / bezierMagicValue;
            const cp2x = p2.x - (p3.x - p1.x) / bezierMagicValue;
            const cp2y = p2.y - (p3.y - p1.y) / bezierMagicValue;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
        ctx.stroke();
    }

    for (const dot of dots) {
        const [x, y] = translateCoords(dot);
        ctx.fillStyle = dot.count === 3 ? lineColor : dotColor;
        ctx.beginPath();
        ctx.arc(x, y, dotRadius * camera.zoom, 0, 2 * Math.PI);
        ctx.fill();
    }

    const color = phases[phase].player === 1 ? p1 : p2;
    if (currentDot) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(...translateCoords(currentDot), dotRadius * camera.zoom, 0, 2 * Math.PI);
        ctx.fill();
    }

    if (currentDot2) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(...translateCoords(currentDot2), dotRadius * camera.zoom, 0, 2 * Math.PI);
        ctx.fill();
    }

    if (currentLine) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 5 * camera.zoom;
        ctx.lineJoin = "round";
        if (currentLine.length < 4) {
            ctx.beginPath();
            for (const [i, dot] of currentLine.entries()) {
                const [x, y] = translateCoords(dot);
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(...translateCoords(currentLine[0]));
            for (let i = 0; i < currentLine.length - 1; i += 1) {
                const p0 =
                    i > 0
                        ? translateCoordsPoint(currentLine[i - 1])
                        : translateCoordsPoint(currentLine[0]);
                const p1 = translateCoordsPoint(currentLine[i]);
                const p2 = translateCoordsPoint(currentLine[i + 1]);
                const p3 =
                    i !== currentLine.length - 2 ? translateCoordsPoint(currentLine[i + 2]) : p2;
                const cp1x = p1.x + (p2.x - p0.x) / bezierMagicValue;
                const cp1y = p1.y + (p2.y - p0.y) / bezierMagicValue;
                const cp2x = p2.x - (p3.x - p1.x) / bezierMagicValue;
                const cp2y = p2.y - (p3.y - p1.y) / bezierMagicValue;
                ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
            }
            ctx.stroke();
        }
    }

    if (closestPoint) {
        ctx.fillStyle = newDotColor;
        ctx.beginPath();
        ctx.arc(...translateCoords(closestPoint), dotRadius * camera.zoom, 0, 2 * Math.PI);
        ctx.fill();
    }

    const fontSize = 26;
    ctx.font = `${fontSize}px arial`;
    ctx.fillStyle = lineColor;
    ctx.textAlign = "center";
    ctx.fillText(phases[phase].title, canvas.width / 2, fontSize + 4);

    requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
