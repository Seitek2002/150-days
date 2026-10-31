// The real night sky (client request, 2026-10-24: "all the constellations in the night sky like in real life"). Bright stars —
// with their real coordinates on the celestial sphere (right ascension in hours, declination in degrees, epoch 2000) and
// magnitude (smaller — brighter), constellations — lines between them (the usual "figures" from astronomy textbooks).
// The sky rotates by the sidereal time of the game clock over the wasteland (latitude and longitude of Southern California): Polaris
// stands over the north, on summer evenings Lyra, Cygnus and Aquila are visible, in winter — Orion, Taurus and Gemini. The southernmost constellations
// (Southern Cross, Centaurus) aren't visible from this latitude and aren't needed.

/** Star color: 0 — white, 1 — blue, 2 — yellow, 3 — orange, 4 — red. */
export type StarTint = 0 | 1 | 2 | 3 | 4;

/** A star: right ascension (hours), declination (degrees), magnitude, color. */
type StarRow = readonly [ra: number, dec: number, mag: number, tint?: StarTint];

/** Latitude and longitude of the wasteland (Southern California), degrees. */
export const SKY_LATITUDE = 34;
export const SKY_LONGITUDE = -118;

const STAR_ROWS = {
  // Ursa Major
  dubhe: [11.062, 61.75, 1.8, 3],
  merak: [11.03, 56.38, 2.4],
  phecda: [11.897, 53.7, 2.4],
  megrez: [12.257, 57.03, 3.3],
  alioth: [12.9, 55.96, 1.8],
  mizar: [13.398, 54.93, 2.2],
  alkaid: [13.792, 49.31, 1.9, 1],
  umaChi: [11.768, 47.78, 3.7, 3],
  umaPsi: [11.162, 44.5, 3.0, 3],
  umaMu: [10.372, 41.5, 3.0, 4],
  umaLambda: [10.285, 42.92, 3.5],
  umaNu: [11.308, 33.09, 3.5, 3],
  umaXi: [11.303, 31.53, 3.8],
  umaOmicron: [8.505, 60.72, 3.4, 2],
  uma23: [9.525, 63.06, 3.7],
  umaTheta: [9.548, 51.68, 3.2],
  umaIota: [8.987, 48.04, 3.1],
  umaKappa: [9.06, 47.16, 3.6],
  // Ursa Minor
  polaris: [2.53, 89.26, 2.0, 2],
  umiDelta: [17.537, 86.59, 4.4],
  umiEpsilon: [16.767, 82.04, 4.2],
  umiZeta: [15.735, 77.79, 4.3],
  kochab: [14.845, 74.16, 2.1, 3],
  pherkad: [15.345, 71.83, 3.0],
  umiEta: [16.292, 75.76, 5.0],
  // Cassiopeia
  caph: [0.153, 59.15, 2.3],
  schedar: [0.675, 56.54, 2.2, 3],
  navi: [0.945, 60.72, 2.2, 1],
  ruchbah: [1.43, 60.24, 2.7],
  segin: [1.907, 63.67, 3.4, 1],
  // Cepheus
  alderamin: [21.31, 62.59, 2.5],
  alfirk: [21.478, 70.56, 3.2, 1],
  errai: [23.655, 77.63, 3.2, 3],
  cepIota: [22.828, 66.2, 3.5, 3],
  cepZeta: [22.182, 58.2, 3.4, 3],
  // Orion
  betelgeuse: [5.92, 7.41, 0.5, 4],
  rigel: [5.242, -8.2, 0.1, 1],
  bellatrix: [5.418, 6.35, 1.6, 1],
  mintaka: [5.533, -0.3, 2.2, 1],
  alnilam: [5.603, -1.2, 1.7, 1],
  alnitak: [5.68, -1.94, 1.8, 1],
  saiph: [5.797, -9.67, 2.1, 1],
  meissa: [5.585, 9.93, 3.4, 1],
  // Taurus and the Pleiades
  aldebaran: [4.598, 16.51, 0.9, 3],
  elnath: [5.438, 28.61, 1.7, 1],
  tauZeta: [5.627, 21.14, 3.0, 1],
  tauTheta: [4.478, 15.87, 3.4],
  tauGamma: [4.33, 15.63, 3.7, 3],
  tauDelta: [4.382, 17.54, 3.8, 3],
  tauEpsilon: [4.477, 19.18, 3.5, 3],
  tauLambda: [4.012, 12.49, 3.4, 1],
  alcyone: [3.792, 24.11, 2.9, 1],
  electra: [3.748, 24.11, 3.7, 1],
  atlas: [3.82, 24.05, 3.6, 1],
  maia: [3.763, 24.37, 3.9, 1],
  merope: [3.772, 23.95, 4.2, 1],
  taygeta: [3.753, 24.47, 4.3, 1],
  // Gemini
  castor: [7.577, 31.89, 1.6],
  pollux: [7.755, 28.03, 1.1, 3],
  alhena: [6.628, 16.4, 1.9],
  mebsuta: [6.732, 25.13, 3.0, 2],
  wasat: [7.335, 21.98, 3.5],
  tejat: [6.383, 22.51, 2.9, 4],
  propus: [6.248, 22.51, 3.3, 4],
  mekbuda: [7.068, 20.57, 3.9, 2],
  gemTheta: [6.88, 33.96, 3.6],
  gemTau: [7.185, 30.25, 4.4, 3],
  gemXi: [6.755, 12.9, 3.4],
  // Canis Major and Canis Minor, Carina (Canopus right above the horizon)
  sirius: [6.752, -16.72, -1.46, 1],
  mirzam: [6.378, -17.96, 2.0, 1],
  adhara: [6.977, -28.97, 1.5, 1],
  wezen: [7.14, -26.39, 1.8, 2],
  aludra: [7.402, -29.3, 2.4, 1],
  cmaIota: [6.935, -17.05, 4.4, 1],
  muliphein: [7.063, -15.63, 4.1],
  furud: [6.338, -30.06, 3.0, 1],
  cmaOmicron: [7.05, -23.83, 3.0, 1],
  procyon: [7.655, 5.22, 0.4, 2],
  gomeisa: [7.453, 8.29, 2.9, 1],
  canopus: [6.4, -52.7, -0.7, 2],
  // Leo
  regulus: [10.14, 11.97, 1.4, 1],
  denebola: [11.818, 14.57, 2.1],
  algieba: [10.333, 19.84, 2.0, 3],
  zosma: [11.235, 20.52, 2.6],
  chertan: [11.237, 15.43, 3.3],
  leoEta: [10.122, 16.76, 3.5],
  adhafera: [10.278, 23.42, 3.4],
  rasalas: [9.88, 26.01, 3.9, 3],
  leoEpsilon: [9.765, 23.77, 3.0, 2],
  // Virgo
  spica: [13.42, -11.16, 1.0, 1],
  porrima: [12.695, -1.45, 2.7],
  vindemiatrix: [13.037, 10.96, 2.8, 2],
  virDelta: [12.927, 3.4, 3.4, 4],
  virZeta: [13.578, -0.6, 3.4],
  zavijava: [11.845, 1.76, 3.6],
  zaniah: [12.332, -0.67, 3.9],
  // Boötes, Corona Borealis
  arcturus: [14.262, 19.18, -0.05, 3],
  izar: [14.75, 27.07, 2.4, 3],
  seginus: [14.535, 38.31, 3.0],
  nekkar: [15.032, 40.39, 3.5, 2],
  booDelta: [15.258, 33.31, 3.5, 2],
  muphrid: [13.912, 18.4, 2.7, 2],
  booRho: [14.53, 30.37, 3.6, 3],
  alphecca: [15.578, 26.71, 2.2],
  crbBeta: [15.463, 29.11, 3.7],
  crbTheta: [15.548, 31.36, 4.1, 1],
  crbGamma: [15.712, 26.3, 3.8],
  crbDelta: [15.827, 26.07, 4.6, 2],
  crbEpsilon: [15.96, 26.88, 4.2, 3],
  crbIota: [16.025, 29.85, 4.9],
  // Hercules
  herZeta: [16.688, 31.6, 2.8, 2],
  herEta: [16.715, 38.92, 3.5, 2],
  herPi: [17.25, 36.81, 3.2, 3],
  herEpsilon: [17.005, 30.93, 3.9],
  kornephoros: [16.503, 21.49, 2.8, 2],
  rasalgethi: [17.243, 14.39, 3.1, 4],
  herDelta: [17.25, 24.84, 3.1],
  herMu: [17.775, 27.72, 3.4, 2],
  herIota: [17.658, 46.01, 3.8, 1],
  herTheta: [17.938, 37.25, 3.9, 3],
  // Lyra, Cygnus, Aquila, Sagitta, Delphinus
  vega: [18.615, 38.78, 0.0, 1],
  sheliak: [18.835, 33.36, 3.5],
  sulafat: [18.982, 32.69, 3.3, 1],
  lyrZeta: [18.747, 37.61, 4.4],
  lyrDelta: [18.908, 36.9, 4.3, 4],
  lyrEpsilon: [18.738, 39.67, 4.7],
  deneb: [20.69, 45.28, 1.25],
  sadr: [20.37, 40.26, 2.2, 2],
  albireo: [19.512, 27.96, 3.1, 3],
  gienahCyg: [20.77, 33.97, 2.5, 3],
  cygDelta: [19.75, 45.13, 2.9],
  cygZeta: [21.215, 30.23, 3.2, 2],
  cygEta: [19.938, 35.08, 3.9, 3],
  cygIota: [19.495, 51.73, 3.8],
  cygKappa: [19.285, 53.37, 3.8, 2],
  altair: [19.847, 8.87, 0.8],
  tarazed: [19.772, 10.61, 2.7, 3],
  alshain: [19.922, 6.41, 3.7, 2],
  aqlDelta: [19.425, 3.11, 3.4],
  aqlZeta: [19.09, 13.86, 3.0],
  aqlTheta: [20.188, -0.82, 3.2, 1],
  aqlLambda: [19.103, -4.88, 3.4, 1],
  aqlEta: [19.875, 1.01, 3.9, 2],
  sgeGamma: [19.98, 19.49, 3.5, 4],
  sgeDelta: [19.79, 18.53, 3.8, 4],
  sgeAlpha: [19.668, 18.01, 4.4, 2],
  sgeBeta: [19.683, 17.48, 4.4, 2],
  delAlpha: [20.66, 15.91, 3.8, 1],
  delBeta: [20.625, 14.6, 3.6],
  delGamma: [20.778, 16.12, 4.3, 3],
  delDelta: [20.725, 15.07, 4.4],
  delEpsilon: [20.553, 11.3, 4.0, 1],
  // Scorpius, Sagittarius, Ophiuchus, Serpens, Libra
  antares: [16.49, -26.43, 1.0, 4],
  dschubba: [16.005, -22.62, 2.3, 1],
  acrab: [16.09, -19.81, 2.6, 1],
  scoPi: [15.982, -26.11, 2.9, 1],
  scoSigma: [16.353, -25.59, 2.9, 1],
  scoTau: [16.598, -28.22, 2.8, 1],
  scoEpsilon: [16.837, -34.29, 2.3, 3],
  scoMu: [16.865, -38.05, 3.0, 1],
  scoZeta: [16.91, -42.36, 3.6, 3],
  scoEta: [17.203, -43.24, 3.3],
  sargas: [17.622, -43.0, 1.9, 2],
  scoIota: [17.793, -40.13, 3.0, 2],
  scoKappa: [17.708, -39.03, 2.4, 1],
  shaula: [17.56, -37.1, 1.6, 1],
  lesath: [17.513, -37.3, 2.7, 1],
  kausAustralis: [18.403, -34.38, 1.8, 1],
  nunki: [18.922, -26.3, 2.0, 1],
  ascella: [19.043, -29.88, 2.6],
  kausMedia: [18.35, -29.83, 2.7, 3],
  kausBorealis: [18.467, -25.42, 2.8, 3],
  alnasl: [18.097, -30.42, 3.0, 3],
  sgrPhi: [18.762, -26.99, 3.2, 1],
  sgrTau: [19.115, -27.67, 3.3, 3],
  rasalhague: [17.582, 12.56, 2.1],
  cebalrai: [17.725, 4.57, 2.8, 3],
  sabik: [17.173, -15.72, 2.4],
  ophZeta: [16.62, -10.57, 2.6, 1],
  yedPrior: [16.238, -3.69, 2.7, 4],
  yedPosterior: [16.305, -4.69, 3.2, 2],
  ophKappa: [16.962, 9.38, 3.2, 3],
  unukalhai: [15.738, 6.43, 2.6, 3],
  serBeta: [15.77, 15.42, 3.7],
  serDelta: [15.58, 10.54, 3.8],
  serEpsilon: [15.847, 4.48, 3.7],
  serGamma: [15.942, 15.66, 3.9, 2],
  zubenelgenubi: [14.848, -16.04, 2.75],
  zubeneschamali: [15.283, -9.38, 2.6, 1],
  libSigma: [15.068, -25.28, 3.3, 4],
  libGamma: [15.592, -14.79, 3.9, 3],
  // Pegasus, Andromeda, Perseus, Triangulum, Aries, Auriga
  markab: [23.08, 15.21, 2.5, 1],
  scheat: [23.063, 28.08, 2.4, 4],
  algenib: [0.22, 15.18, 2.8, 1],
  alpheratz: [0.14, 29.09, 2.1, 1],
  enif: [21.737, 9.88, 2.4, 3],
  homam: [22.692, 10.83, 3.4, 1],
  pegTheta: [22.17, 6.2, 3.5],
  matar: [22.717, 30.22, 2.9, 2],
  pegMu: [22.833, 24.6, 3.5, 2],
  pegLambda: [22.775, 23.57, 4.0, 2],
  mirach: [1.162, 35.62, 2.1, 4],
  almach: [2.065, 42.33, 2.1, 3],
  andDelta: [0.655, 30.86, 3.3, 3],
  andMu: [0.945, 38.5, 3.9],
  andNu: [0.83, 41.08, 4.5, 1],
  mirfak: [3.405, 49.86, 1.8, 2],
  algol: [3.137, 40.96, 2.1, 1],
  perGamma: [2.905, 53.51, 2.9, 2],
  perDelta: [3.715, 47.79, 3.0, 1],
  perEpsilon: [3.965, 40.01, 2.9, 1],
  perZeta: [3.902, 31.88, 2.9, 1],
  perEta: [2.845, 55.9, 3.8, 3],
  perRho: [3.087, 38.84, 3.4, 4],
  triAlpha: [1.885, 29.58, 3.4, 2],
  triBeta: [2.158, 34.99, 3.0],
  triGamma: [2.288, 33.85, 4.0],
  hamal: [2.12, 23.46, 2.0, 3],
  sheratan: [1.91, 20.81, 2.6],
  mesarthim: [1.892, 19.29, 3.9],
  ari41: [2.833, 27.26, 3.6, 1],
  capella: [5.278, 46.0, 0.1, 2],
  menkalinan: [5.992, 44.95, 1.9],
  aurTheta: [5.995, 37.21, 2.6],
  hassaleh: [4.95, 33.17, 2.7, 3],
  aurEpsilon: [5.033, 43.82, 3.0, 2],
  aurEta: [5.108, 41.23, 3.2, 1],
  // Draco
  eltanin: [17.943, 51.49, 2.2, 3],
  rastaban: [17.507, 52.3, 2.8, 2],
  grumium: [17.892, 56.87, 3.8, 3],
  draNu: [17.537, 55.18, 4.9],
  altais: [19.21, 67.66, 3.1, 2],
  draEpsilon: [19.803, 70.27, 3.8, 2],
  draChi: [18.352, 72.73, 3.6, 2],
  draZeta: [17.147, 65.71, 3.2, 1],
  draEta: [16.4, 61.51, 2.7, 2],
  draTheta: [16.032, 58.57, 4.0],
  draIota: [15.415, 58.97, 3.3, 3],
  thuban: [14.073, 64.38, 3.7],
  draKappa: [12.558, 69.79, 3.9, 1],
  giausar: [11.523, 69.33, 3.8, 4],
  // Cancer, Hydra, Corvus, Canes Venatici, Coma Berenices
  tarf: [8.275, 9.19, 3.5, 3],
  asellusAustralis: [8.745, 18.15, 3.9, 3],
  asellusBorealis: [8.722, 21.47, 4.7],
  cncIota: [8.778, 28.76, 4.0, 2],
  acubens: [8.975, 11.86, 4.3],
  alphard: [9.46, -8.66, 2.0, 3],
  hyaDelta: [8.628, 5.7, 4.2],
  hyaEpsilon: [8.78, 6.42, 3.4, 2],
  hyaZeta: [8.923, 5.95, 3.1, 3],
  hyaEta: [8.72, 3.4, 4.3, 1],
  hyaSigma: [8.647, 3.34, 4.4, 3],
  hyaTheta: [9.24, 2.31, 3.9],
  hyaIota: [9.665, -1.14, 3.9, 3],
  gienahCrv: [12.263, -17.54, 2.6, 1],
  kraz: [12.573, -23.4, 2.7, 2],
  algorab: [12.498, -16.52, 2.9],
  crvEpsilon: [12.168, -22.62, 3.0, 3],
  corCaroli: [12.933, 38.32, 2.9],
  chara: [12.562, 41.36, 4.3, 2],
  comBeta: [13.198, 27.88, 4.3, 2],
  comAlpha: [13.167, 17.53, 4.3],
  comGamma: [12.448, 28.27, 4.4, 3],
  // Capricornus, Aquarius, Pisces, Piscis Austrinus, Cetus
  algedi: [20.302, -12.54, 3.6, 2],
  dabih: [20.35, -14.78, 3.1, 2],
  denebAlgedi: [21.783, -16.13, 2.9],
  nashira: [21.668, -16.66, 3.7],
  capZeta: [21.445, -22.41, 3.7, 2],
  capOmega: [20.863, -26.92, 4.1, 4],
  capPsi: [20.768, -25.27, 4.1],
  capTheta: [21.098, -17.23, 4.1],
  sadalsuud: [21.527, -5.57, 2.9, 2],
  sadalmelik: [22.097, -0.32, 2.9, 2],
  skat: [22.912, -15.82, 3.3],
  aqrZeta: [22.48, -0.02, 3.7],
  aqrGamma: [22.362, -1.39, 3.8],
  aqrEta: [22.59, -0.12, 4.0],
  aqrLambda: [22.877, -7.58, 3.7, 4],
  albali: [20.795, -9.5, 3.8],
  pscGamma: [23.287, 3.28, 3.7, 2],
  pscOmega: [23.988, 6.86, 4.0],
  pscDelta: [0.812, 7.59, 4.4, 3],
  pscEpsilon: [1.048, 7.89, 4.3, 3],
  alrescha: [2.033, 2.76, 3.8],
  pscEta: [1.525, 15.35, 3.6, 2],
  fomalhaut: [22.962, -29.62, 1.2],
  psaEpsilon: [22.678, -27.04, 4.2, 1],
  psaDelta: [22.932, -32.54, 4.2, 2],
  diphda: [0.727, -17.99, 2.0, 3],
  menkar: [3.038, 4.09, 2.5, 4],
  mira: [2.322, -2.98, 3.5, 4],
  cetGamma: [2.722, 3.24, 3.5],
  cetDelta: [2.658, 0.33, 4.1, 1],
  cetTau: [1.735, -15.94, 3.5, 2],
  cetZeta: [1.858, -10.34, 3.7, 3],
  cetTheta: [1.4, -8.18, 3.6, 3],
  cetEta: [1.143, -10.18, 3.5, 3],
  cetIota: [0.323, -8.82, 3.6, 3],
  // Lepus, Columba, Eridanus
  arneb: [5.545, -17.82, 2.6, 2],
  nihal: [5.47, -20.76, 2.8, 2],
  lepEpsilon: [5.092, -22.37, 3.2, 3],
  lepMu: [5.215, -16.21, 3.3, 1],
  lepGamma: [5.742, -22.45, 3.6, 2],
  lepDelta: [5.855, -20.88, 3.8, 2],
  phact: [5.66, -34.07, 2.6, 1],
  wazn: [5.85, -35.77, 3.1, 3],
  cursa: [5.132, -5.09, 2.8],
  eriMu: [4.758, -3.25, 4.0, 1],
  zaurak: [3.967, -13.51, 2.9, 4],
  eriDelta: [3.72, -9.76, 3.5, 2],
  eriEpsilon: [3.548, -9.46, 3.7, 3],
  eriEta: [2.94, -8.9, 3.9, 3],
} as const satisfies Record<string, StarRow>;

export type StarName = keyof typeof STAR_ROWS;

/** A constellation: a key (for the name in i18n) and the figure's lines — pairs of stars. */
export interface Constellation {
  key: string;
  lines: readonly (readonly [StarName, StarName])[];
  /** Stars without lines (Canopus, the Pleiades) — also part of the constellation. */
  extra?: readonly StarName[];
}

/** A chain a—b—c—…: lines between neighbors. */
const chain = (...names: StarName[]): [StarName, StarName][] => names.slice(1).map((n, i) => [names[i]!, n]);

export const CONSTELLATIONS: readonly Constellation[] = [
  {
    key: 'ursaMajor',
    lines: [
      ...chain('dubhe', 'merak', 'phecda', 'megrez', 'dubhe'),
      ...chain('megrez', 'alioth', 'mizar', 'alkaid'),
      ...chain('phecda', 'umaChi', 'umaNu', 'umaXi'),
      ...chain('umaChi', 'umaPsi', 'umaMu', 'umaLambda'),
      ...chain('dubhe', 'uma23', 'umaOmicron'),
      ...chain('uma23', 'umaTheta', 'umaIota', 'umaKappa'),
      ['merak', 'umaTheta'],
    ],
  },
  { key: 'ursaMinor', lines: [...chain('polaris', 'umiDelta', 'umiEpsilon', 'umiZeta', 'kochab', 'pherkad', 'umiEta', 'umiZeta')] },
  { key: 'cassiopeia', lines: chain('caph', 'schedar', 'navi', 'ruchbah', 'segin') },
  { key: 'cepheus', lines: [...chain('alderamin', 'alfirk', 'errai', 'cepIota', 'cepZeta', 'alderamin'), ['alfirk', 'cepIota']] },
  {
    key: 'orion',
    lines: [...chain('betelgeuse', 'meissa', 'bellatrix'), ['betelgeuse', 'bellatrix'], ...chain('betelgeuse', 'alnitak', 'alnilam', 'mintaka', 'bellatrix'), ['alnitak', 'saiph'], ['mintaka', 'rigel']],
  },
  {
    key: 'taurus',
    lines: [...chain('tauLambda', 'tauGamma', 'tauDelta', 'tauEpsilon', 'elnath'), ...chain('tauGamma', 'tauTheta', 'aldebaran', 'tauZeta')],
    extra: ['alcyone', 'electra', 'atlas', 'maia', 'merope', 'taygeta'],
  },
  { key: 'gemini', lines: [['castor', 'pollux'], ...chain('castor', 'gemTau', 'mebsuta', 'tejat', 'propus'), ['gemTau', 'gemTheta'], ...chain('pollux', 'wasat', 'mekbuda', 'alhena', 'gemXi')] },
  { key: 'canisMajor', lines: [['sirius', 'mirzam'], ...chain('sirius', 'cmaIota', 'muliphein'), ...chain('sirius', 'cmaOmicron', 'wezen', 'adhara', 'furud'), ['wezen', 'aludra']] },
  { key: 'canisMinor', lines: [['procyon', 'gomeisa']] },
  { key: 'carina', lines: [], extra: ['canopus'] },
  { key: 'leo', lines: [...chain('regulus', 'leoEta', 'algieba', 'adhafera', 'rasalas', 'leoEpsilon'), ...chain('algieba', 'zosma', 'denebola', 'chertan', 'regulus'), ['zosma', 'chertan']] },
  { key: 'virgo', lines: [...chain('zavijava', 'zaniah', 'porrima', 'virDelta', 'vindemiatrix'), ['porrima', 'spica'], ...chain('virDelta', 'virZeta', 'spica')] },
  { key: 'bootes', lines: [...chain('arcturus', 'izar', 'booDelta', 'nekkar', 'seginus', 'booRho', 'arcturus'), ['arcturus', 'muphrid']] },
  { key: 'coronaBorealis', lines: chain('crbTheta', 'crbBeta', 'alphecca', 'crbGamma', 'crbDelta', 'crbEpsilon', 'crbIota') },
  {
    key: 'hercules',
    lines: [...chain('herZeta', 'herEta', 'herPi', 'herEpsilon', 'herZeta'), ['herZeta', 'kornephoros'], ...chain('herEpsilon', 'herDelta', 'rasalgethi'), ['herDelta', 'herMu'], ...chain('herPi', 'herTheta', 'herIota')],
  },
  { key: 'lyra', lines: [...chain('vega', 'lyrZeta', 'sheliak', 'sulafat', 'lyrDelta', 'lyrZeta'), ['vega', 'lyrEpsilon']] },
  { key: 'cygnus', lines: [...chain('deneb', 'sadr', 'cygEta', 'albireo'), ...chain('sadr', 'cygDelta', 'cygIota', 'cygKappa'), ...chain('sadr', 'gienahCyg', 'cygZeta')] },
  { key: 'aquila', lines: [...chain('tarazed', 'altair', 'alshain'), ...chain('altair', 'aqlDelta', 'aqlLambda'), ['aqlDelta', 'aqlZeta'], ...chain('aqlDelta', 'aqlEta', 'aqlTheta')] },
  { key: 'sagitta', lines: [...chain('sgeGamma', 'sgeDelta', 'sgeAlpha'), ['sgeDelta', 'sgeBeta']] },
  { key: 'delphinus', lines: [...chain('delEpsilon', 'delBeta', 'delAlpha', 'delGamma', 'delDelta', 'delBeta')] },
  {
    key: 'scorpius',
    lines: [['acrab', 'dschubba'], ['dschubba', 'scoPi'], ...chain('dschubba', 'scoSigma', 'antares', 'scoTau', 'scoEpsilon', 'scoMu', 'scoZeta', 'scoEta', 'sargas', 'scoIota', 'scoKappa', 'shaula', 'lesath')],
  },
  {
    key: 'sagittarius',
    lines: [
      ...chain('alnasl', 'kausMedia', 'kausAustralis', 'alnasl'),
      ...chain('kausMedia', 'kausBorealis', 'sgrPhi', 'kausMedia'),
      ...chain('sgrPhi', 'nunki', 'sgrTau', 'ascella', 'sgrPhi'),
      ['ascella', 'kausAustralis'],
    ],
  },
  { key: 'ophiuchus', lines: chain('rasalhague', 'cebalrai', 'sabik', 'ophZeta', 'yedPosterior', 'yedPrior', 'ophKappa', 'rasalhague') },
  { key: 'serpens', lines: chain('serEpsilon', 'unukalhai', 'serDelta', 'serBeta', 'serGamma') },
  { key: 'libra', lines: [...chain('zubenelgenubi', 'zubeneschamali', 'libGamma', 'zubenelgenubi'), ['zubenelgenubi', 'libSigma']] },
  {
    key: 'pegasus',
    lines: [...chain('markab', 'scheat', 'alpheratz', 'algenib', 'markab'), ...chain('markab', 'homam', 'pegTheta', 'enif'), ['scheat', 'matar'], ...chain('scheat', 'pegMu', 'pegLambda')],
  },
  { key: 'andromeda', lines: [...chain('alpheratz', 'andDelta', 'mirach', 'almach'), ...chain('mirach', 'andMu', 'andNu')] },
  { key: 'perseus', lines: [...chain('perEta', 'perGamma', 'mirfak', 'perDelta', 'perEpsilon', 'perZeta'), ...chain('mirfak', 'algol', 'perRho')] },
  { key: 'triangulum', lines: chain('triAlpha', 'triBeta', 'triGamma', 'triAlpha') },
  { key: 'aries', lines: chain('mesarthim', 'sheratan', 'hamal', 'ari41') },
  { key: 'auriga', lines: [...chain('capella', 'menkalinan', 'aurTheta', 'elnath', 'hassaleh', 'capella'), ...chain('capella', 'aurEpsilon', 'aurEta')] },
  {
    key: 'draco',
    lines: [...chain('eltanin', 'rastaban', 'draNu', 'grumium', 'eltanin'), ...chain('grumium', 'altais', 'draEpsilon', 'draChi', 'draZeta', 'draEta', 'draTheta', 'draIota', 'thuban', 'draKappa', 'giausar')],
  },
  { key: 'cancer', lines: [...chain('tarf', 'asellusAustralis', 'asellusBorealis', 'cncIota'), ['asellusAustralis', 'acubens']] },
  { key: 'hydra', lines: [...chain('hyaDelta', 'hyaEpsilon', 'hyaZeta', 'hyaEta', 'hyaSigma', 'hyaDelta'), ...chain('hyaZeta', 'hyaTheta', 'hyaIota', 'alphard')] },
  { key: 'corvus', lines: chain('gienahCrv', 'algorab', 'kraz', 'crvEpsilon', 'gienahCrv') },
  { key: 'canesVenatici', lines: [['corCaroli', 'chara']] },
  { key: 'comaBerenices', lines: chain('comGamma', 'comBeta', 'comAlpha') },
  { key: 'capricornus', lines: chain('algedi', 'dabih', 'capPsi', 'capOmega', 'capZeta', 'denebAlgedi', 'nashira', 'capTheta', 'algedi') },
  { key: 'aquarius', lines: [...chain('albali', 'sadalsuud', 'sadalmelik', 'aqrGamma', 'aqrZeta', 'aqrEta', 'aqrLambda', 'skat')] },
  { key: 'pisces', lines: chain('pscGamma', 'pscOmega', 'pscDelta', 'pscEpsilon', 'alrescha', 'pscEta') },
  { key: 'piscisAustrinus', lines: [['fomalhaut', 'psaEpsilon'], ['fomalhaut', 'psaDelta']] },
  {
    key: 'cetus',
    lines: [...chain('menkar', 'cetGamma', 'cetDelta', 'mira', 'cetZeta', 'cetTau', 'diphda', 'cetIota', 'cetEta', 'cetTheta', 'cetZeta')],
  },
  { key: 'lepus', lines: [...chain('lepMu', 'arneb', 'nihal', 'lepEpsilon'), ...chain('arneb', 'lepDelta', 'lepGamma', 'nihal')] },
  { key: 'columba', lines: [['phact', 'wazn']] },
  { key: 'eridanus', lines: chain('cursa', 'eriMu', 'zaurak', 'eriDelta', 'eriEpsilon', 'eriEta') },
];

/** A catalog star: position on the celestial sphere (radians) and magnitude. */
export interface CatalogStar {
  name: StarName;
  ra: number;
  dec: number;
  mag: number;
  tint: StarTint;
}

const RAD = Math.PI / 180;

/** All catalog stars (radians). */
export const STARS: readonly CatalogStar[] = (Object.keys(STAR_ROWS) as StarName[]).map((name) => {
  const row: StarRow = STAR_ROWS[name];
  return { name, ra: row[0] * 15 * RAD, dec: row[1] * RAD, mag: row[2], tint: row[3] ?? 0 };
});

/** A star's index in STARS by name. */
export const STAR_INDEX: ReadonlyMap<StarName, number> = new Map(STARS.map((s, i) => [s.name, i]));

/**
 * Local sidereal time (radians) for the game clock: dateMs — date and time on the wasteland clock (like Date.UTC with local
 * hours), the time zone is eight hours west of Greenwich. The usual formula, from noon on January 1, 2000.
 */
export function localSiderealTime(dateMs: number, longitude = SKY_LONGITUDE): number {
  const utc = dateMs + 8 * 3600 * 1000;
  const days = (utc - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const gmstHours = 18.697374558 + 24.06570982441908 * days;
  const hours = (((gmstHours + longitude / 15) % 24) + 24) % 24;
  return (hours / 24) * Math.PI * 2;
}

/**
 * Where a celestial sphere point is on our sky: direction as a world view angle (0 — east, π/2 — south, −π/2 — north)
 * and altitude above the horizon (radians).
 */
export function skyPosition(ra: number, dec: number, sidereal: number, latitude = SKY_LATITUDE * RAD): { az: number; el: number } {
  const h = sidereal - ra;
  const cosDec = Math.cos(dec);
  const east = -cosDec * Math.sin(h);
  const north = -cosDec * Math.cos(h) * Math.sin(latitude) + Math.sin(dec) * Math.cos(latitude);
  const up = cosDec * Math.cos(h) * Math.cos(latitude) + Math.sin(dec) * Math.sin(latitude);
  return { az: Math.atan2(east, north) - Math.PI / 2, el: Math.asin(Math.max(-1, Math.min(1, up))) };
}

/**
 * Galaxies and nebulae the eye can make out only after adapting to the dark (client request, 2026-10-26): position on the celestial
 * sphere (radians), patch size (radians on our sky — larger than the real ones, otherwise they can't be made out), elongation, tilt,
 * brightness and a bright core (0 — none; client, 2026-10-31: the galaxies were too faint to notice). The Andromeda Galaxy, the
 * Triangulum Galaxy, the Orion Nebula, the Lagoon Nebula and the great globular cluster in Hercules.
 */
export const DEEP_SKY: readonly { ra: number; dec: number; size: number; stretch: number; tilt: number; shine: number; core: number }[] = [
  { ra: 0.712 * 15 * RAD, dec: 41.27 * RAD, size: 0.05, stretch: 3, tilt: 0.6, shine: 1, core: 1 },
  { ra: 1.564 * 15 * RAD, dec: 30.66 * RAD, size: 0.028, stretch: 1.6, tilt: -0.4, shine: 0.6, core: 0.3 },
  { ra: 5.588 * 15 * RAD, dec: -5.39 * RAD, size: 0.026, stretch: 1.3, tilt: 0.3, shine: 0.75, core: 0.7 },
  { ra: 18.06 * 15 * RAD, dec: -24.38 * RAD, size: 0.024, stretch: 1.8, tilt: 0.2, shine: 0.6, core: 0.4 },
  { ra: 16.695 * 15 * RAD, dec: 36.46 * RAD, size: 0.012, stretch: 1, tilt: 0, shine: 0.7, core: 1 },
];

/** A star of an open cluster: place on the celestial sphere (radians) and magnitude. */
export interface ClusterStar {
  ra: number;
  dec: number;
  mag: number;
}

/** Hours, minutes, seconds of right ascension and degrees, minutes of declination → radians. */
const raOf = (h: number, m: number, sec = 0): number => (h + m / 60 + sec / 3600) * 15 * RAD;
const decOf = (d: number, m: number): number => (Math.sign(d || 1) * (Math.abs(d) + m / 60)) * RAD;

/**
 * Open star clusters (client, 2026-10-31: "I see the haze but no clusters"): centre on the celestial sphere, real radius (radians),
 * spread — how many times wider they are drawn (at real size most are a few pixels), how many faint members are scattered around
 * (count, magnitudes from bright to faint) and the brightest members at their real places. The Pleiades, the Hyades, the Beehive,
 * the Double Cluster in Perseus, the Coma Star Cluster, Ptolemy's Cluster and the Butterfly Cluster.
 */
const CLUSTER_DEFS: readonly {
  ra: number;
  dec: number;
  radius: number;
  spread: number;
  count: number;
  mags: readonly [number, number];
  members?: readonly ClusterStar[];
}[] = [
  {
    ra: raOf(3, 47, 0),
    dec: decOf(24, 7),
    radius: 1 * RAD,
    spread: 2.5,
    count: 26,
    mags: [5.8, 8],
    members: [
      { ra: raOf(3, 47, 29), dec: decOf(24, 6.3), mag: 2.9 },
      { ra: raOf(3, 49, 10), dec: decOf(24, 3.2), mag: 3.6 },
      { ra: raOf(3, 44, 53), dec: decOf(24, 6.8), mag: 3.7 },
      { ra: raOf(3, 45, 50), dec: decOf(24, 22.1), mag: 3.9 },
      { ra: raOf(3, 46, 20), dec: decOf(23, 56.9), mag: 4.2 },
      { ra: raOf(3, 45, 12), dec: decOf(24, 28), mag: 4.3 },
      { ra: raOf(3, 49, 11), dec: decOf(24, 8.2), mag: 5.1 },
      { ra: raOf(3, 44, 48), dec: decOf(24, 17.4), mag: 5.4 },
      { ra: raOf(3, 45, 54), dec: decOf(24, 33.3), mag: 5.8 },
    ],
  },
  { ra: raOf(4, 27), dec: decOf(15, 52), radius: 2.5 * RAD, spread: 1, count: 22, mags: [3.4, 6.5] },
  { ra: raOf(8, 40), dec: decOf(19, 59), radius: 0.6 * RAD, spread: 2.5, count: 32, mags: [6, 8] },
  { ra: raOf(2, 19), dec: decOf(57, 9), radius: 0.25 * RAD, spread: 3, count: 22, mags: [6.5, 9] },
  { ra: raOf(2, 22), dec: decOf(57, 7), radius: 0.25 * RAD, spread: 3, count: 22, mags: [6.5, 9] },
  { ra: raOf(12, 25), dec: decOf(26, 0), radius: 2.5 * RAD, spread: 1, count: 20, mags: [4.5, 6.8] },
  { ra: raOf(17, 54), dec: decOf(-34, 49), radius: 0.6 * RAD, spread: 2.5, count: 28, mags: [5.6, 8] },
  { ra: raOf(17, 40), dec: decOf(-32, 13), radius: 0.3 * RAD, spread: 2.5, count: 16, mags: [6, 8.5] },
];

/** A repeatable random sequence (the same scatter of cluster stars every game). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All cluster stars, widened by each cluster's spread around its centre (CLUSTER_DEFS). */
export const CLUSTER_STARS: readonly ClusterStar[] = CLUSTER_DEFS.flatMap((c, k) => {
  const rnd = seeded(7919 * (k + 1));
  const widen = (star: ClusterStar): ClusterStar => ({
    ra: c.ra + (star.ra - c.ra) * c.spread,
    dec: c.dec + (star.dec - c.dec) * c.spread,
    mag: star.mag,
  });
  const scatter: ClusterStar[] = [];
  for (let i = 0; i < c.count; i++) {
    // Denser towards the centre, fainter on average further out.
    const r = c.radius * Math.sqrt(rnd()) * (0.4 + 0.6 * rnd());
    const a = rnd() * Math.PI * 2;
    const t = rnd();
    scatter.push({ ra: c.ra + (r * Math.cos(a)) / Math.max(0.2, Math.cos(c.dec)), dec: c.dec + r * Math.sin(a), mag: c.mags[0] + (c.mags[1] - c.mags[0]) * t * t });
  }
  return [...(c.members ?? []), ...scatter].map(widen);
});

/** North Galactic Pole (radians): the Milky Way's latitude is measured from it. */
export const GALACTIC_POLE = { ra: 192.86 * RAD, dec: 27.13 * RAD };

/** The Moon: position on the celestial sphere (radians), what fraction of the disc is lit (0 — new moon, 1 — full moon), whether it is waxing. */
export interface MoonPlace {
  ra: number;
  dec: number;
  lit: number;
  waxing: boolean;
}

/**
 * Where the Moon is for the game clock (dateMs — as in localSiderealTime) — by short formulas (mean longitudes with the main
 * corrections, accuracy — about a degree): ecliptic longitude and latitude, conversion to the celestial sphere; phase — by the angle between
 * the Moon and the Sun.
 */
export function moonPlace(dateMs: number): MoonPlace {
  const d = (dateMs + 8 * 3600 * 1000 - Date.UTC(2000, 0, 1, 12)) / 86400000;
  const deg = (v: number) => (((v % 360) + 360) % 360) * RAD;
  const meanLon = deg(218.316 + 13.176396 * d);
  const anomaly = deg(134.963 + 13.064993 * d);
  const node = deg(93.272 + 13.22935 * d);
  const lon = meanLon + 6.289 * RAD * Math.sin(anomaly);
  const lat = 5.128 * RAD * Math.sin(node);
  const sunAnomaly = deg(357.529 + 0.98560028 * d);
  const sunLon = deg(280.459 + 0.98564736 * d) + 1.915 * RAD * Math.sin(sunAnomaly);
  const tilt = 23.439 * RAD;
  const ra = Math.atan2(Math.sin(lon) * Math.cos(tilt) - Math.tan(lat) * Math.sin(tilt), Math.cos(lon));
  const dec = Math.asin(Math.sin(lat) * Math.cos(tilt) + Math.cos(lat) * Math.sin(tilt) * Math.sin(lon));
  const elongation = Math.acos(Math.max(-1, Math.min(1, Math.cos(lat) * Math.cos(lon - sunLon))));
  const ahead = (((lon - sunLon) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return { ra: (ra + Math.PI * 2) % (Math.PI * 2), dec, lit: (1 - Math.cos(elongation)) / 2, waxing: ahead < Math.PI };
}
