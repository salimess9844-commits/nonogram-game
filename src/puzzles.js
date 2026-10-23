// Puzzle catalogue shared by the page and the scoring function, so points are computed server-side.
const HAND = [
  // 5x5
  { id: "s5-heart", n: 5, name: "Heart", rows: [".#.#.", "#####", "#####", ".###.", "..#.."] },
  { id: "s5-face", n: 5, name: "Face", rows: [".#.#.", ".#.#.", ".....", "#...#", ".###."] },
  { id: "s5-arrow", n: 5, name: "Arrow", rows: ["..#..", ".###.", "#.#.#", "..#..", "..#.."] },
  { id: "s5-house", n: 5, name: "House", rows: ["..#..", ".###.", "#####", "##.##", "##.##"] },
  { id: "s5-tree", n: 5, name: "Tree", rows: ["..#..", ".###.", "#####", "..#..", "..#.."] },
  { id: "s5-diamond", n: 5, name: "Diamond", rows: ["..#..", ".###.", "#####", ".###.", "..#.."] },
  { id: "s5-plus", n: 5, name: "Plus", rows: ["..#..", "..#..", "#####", "..#..", "..#.."] },
  { id: "s5-sail", n: 5, name: "Sail", rows: ["..#..", "..##.", "..###", "#####", ".###."] },
  { id: "s5-letter", n: 5, name: "Letter A", rows: [".###.", "#...#", "#####", "#...#", "#...#"] },
  // 10x10
  { id: "s10-heart", n: 10, name: "Big Heart", rows: [
    "..........", ".###..###.", "##########", "##########", "##########",
    ".########.", "..######..", "...####...", "....##....", ".........." ] },
  { id: "s10-invader", n: 10, name: "Invader", rows: [
    "..#....#..", "...#..#...", "..######..", ".##.##.##.", "##########",
    "#.######.#", "#.#....#.#", "...##.##..", "..........", ".........." ] },
  { id: "s10-ghost", n: 10, name: "Ghost", rows: [
    "...####...", "..######..", ".########.", ".#..##..#.", ".#..##..#.",
    ".########.", ".########.", ".########.", ".##.##.##.", ".#..##..#." ] },
  { id: "s10-rocket", n: 10, name: "Rocket", rows: [
    "....##....", "...####...", "..######..", "..##..##..", "..######..",
    "..######..", ".########.", "##.####.##", "#..####..#", "....##...." ] },
  { id: "s10-mushroom", n: 10, name: "Mushroom", rows: [
    "..######..", ".########.", "###.##.###", "##########", "##########",
    ".########.", "....##....", "...####...", "...####...", "..######.." ] },
  { id: "s10-cactus", n: 10, name: "Cactus", rows: [
    "....##....", ".#..##....", ".#..##..#.", ".#..##..#.", ".##.##.##.",
    "..######..", "....##....", "....##....", "....##....", "..######.." ] },
  { id: "s10-sailboat", n: 10, name: "Sailboat", rows: [
    "....#.....", "....##....", "....###...", "....####..", "....#####.",
    "....######", "....#.....", "##########", ".########.", "..######.." ] },
  { id: "s10-star", n: 10, name: "Star", rows: [
    "....##....", "....##....", "...####...", "##########", ".########.",
    "..######..", "..######..", ".###..###.", ".##....##.", ".#......#." ] },
  { id: "s10-pine", n: 10, name: "Pine", rows: [
    "....##....", "...####...", "..######..", ".########.", "...####...",
    "..######..", ".########.", "##########", "....##....", "....##...." ] },
];

function fromFn(n, fn) {
  const rows = [];
  for (let r = 0; r < n; r++) {
    let s = "";
    for (let c = 0; c < n; c++) s += fn(r, c) ? "#" : ".";
    rows.push(s);
  }
  return rows;
}

const GEN = [
  { id: "s15-heart", n: 15, name: "Grand Heart", rows: fromFn(15, (r, c) => {
    const x = (c - 7) / 5.6, y = (7.4 - r) / 5.6;
    return Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0;
  }) },
  { id: "s15-smiley", n: 15, name: "Smiley", rows: fromFn(15, (r, c) => {
    const d = Math.hypot(r - 7, c - 7);
    if (d > 6.8) return false;
    if ((r === 4 || r === 5) && (c === 4 || c === 5 || c === 9 || c === 10)) return false;
    if (r === 9 && (c === 3 || c === 11)) return false;
    if (r === 10 && c >= 4 && c <= 10) return false;
    return true;
  }) },
  { id: "s15-moon", n: 15, name: "Crescent", rows: fromFn(15, (r, c) =>
    Math.hypot(r - 7, c - 7) <= 6.8 && Math.hypot(r - 7, c - 3.4) > 6.2) },
  { id: "s15-target", n: 15, name: "Bullseye", rows: fromFn(15, (r, c) => {
    const d = Math.hypot(r - 7, c - 7);
    return d <= 1.5 || (d >= 2.8 && d <= 4.0) || (d >= 5.3 && d <= 6.9);
  }) },
  { id: "s15-hourglass", n: 15, name: "Hourglass", rows: fromFn(15, (r, c) => {
    if (r === 0 || r === 14) return true;
    return Math.abs(c - 7) <= Math.abs(r - 7);
  }) },
];


export const clues = (arr) => {
  const out = []; let run = 0;
  for (const v of arr) { if (v) run++; else if (run) { out.push(run); run = 0; } }
  if (run) out.push(run);
  return out.length ? out : [0];
};

export const PUZZLES = HAND.concat(GEN).map((p) => {
  const sol = p.rows.map((s) => [...s].map((ch) => (ch === "#" ? 1 : 0)));
  return Object.assign({}, p, {
    sol,
    rowC: sol.map(clues),
    colC: sol[0].map((_, c) => clues(sol.map((row) => row[c]))),
  });
});

export const BASE = { 5: 10, 10: 30, 15: 80 };

export function pointsFor(p, ms) {
  const par = p.n * p.n * 1500;
  return Math.round(BASE[p.n] * (1 + Math.max(0, 1 - ms / par)));
}
