// 結合テスト用のサンプル大会データ（docs/結合テスト.md「11. サンプルデータによるバリエーション」）。
// 各サンプルは API の入力仕様（POST /api/tournaments・PUT competition・PUT players）に従った値で定義し、
// tests/integration/fixtures/seed.ts の seedSample() で投入する。
// スコアは「選手名 → ラウンドごとの8ホール打数（ホール1〜8順）」で定義する（パーティ編成がランダムでも選手単位で決まる）。

import type { Competition as StoredCompetition } from '@/types/tournament';
import type { PlayerInput } from '../helpers';

/** 競技情報の入力（PUT /api/tournaments/:id/competition の competition） */
export type Competition = Omit<StoredCompetition, 'tournamentId'>;

/** [順位, 選手名, 総合スコア, じゃんけん待ち] */
export type IndividualExpect = [number, string, number, boolean?];
/** [順位, チーム名, 人数, 合計スコア, じゃんけん待ち] */
export type TeamExpect = [number, string, number, number, boolean?];

export type Sample = {
  /** ケースID（I-VAR-nn） */
  id: string;
  title: string;
  tournament?: { name?: string; date?: string; place?: string };
  competition: Partial<Competition>;
  players: PlayerInput[];
  /** 選手名 → ラウンドごとの8ホール打数。パーティ内の全選手が揃ったラウンドのみ保存する */
  scores?: Record<string, number[][]>;
  expect: {
    /** 組合せ表生成エラー（エラーダイアログ文言） */
    pairingError?: string;
    /** パーティ番号順の [パーティ番号, 人数] */
    parties?: [number, number][];
    /** パーティ番号順の開始ホール */
    startHoles?: number[];
    /** パーティ番号 → 必ず含まれる選手名 */
    members?: Record<number, string[]>;
    /** 選手名 → 保存後の生年月日（YYYY-MM-DD） */
    birthDates?: Record<string, string>;
    individual?: IndividualExpect[];
    individualCount?: number;
    team?: TeamExpect[];
    excluded?: string[];
    /** [A6] 選手名 → 年齢表示 */
    ages?: Record<string, string>;
    /** [A6] 選手名 → ラウンド1のホール1〜8のセル表示 */
    cells?: Record<string, string[]>;
    /** [A7] チーム戦順位表の各行（順位・チーム名・人数・スコア・合計年齢の表示） */
    teamRows?: string[][];
  };
};

// ---------- スコア作成ヘルパー ----------

/** 8ホール合計が total になる打数（ホールインワンを含まない。16〜113） */
export const T = (total: number): number[] => {
  if (total < 16 || total > 113) throw new Error(`T(${total}) は16〜113で指定してください`);
  return [total - 14, 2, 2, 2, 2, 2, 2, 2];
};

/** n名の選手（選手名は prefix + 連番ゼロ埋め） */
const many = (
  n: number,
  prefix: string,
  f: (i: number) => Partial<PlayerInput> = () => ({}),
): PlayerInput[] =>
  Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return {
      name: `${prefix}${String(i).padStart(3, '0')}`,
      birthDate: '1960/01/01',
      teamName: '',
      partyFixed: false,
      partyNumber: null,
      ...f(i),
    };
  });

const pl = (name: string, birthDate: string, teamName = '', extra: Partial<PlayerInput> = {}): PlayerInput => ({
  name,
  birthDate,
  teamName,
  partyFixed: false,
  partyNumber: null,
  ...extra,
});

const fixedAt = (partyNumber: number): Partial<PlayerInput> => ({ partyFixed: true, partyNumber });

/** 開始ホールの期待値（パーティ番号順に perHole 件ずつ 1,2,3…） */
const holes = (count: number, perHole: number) => Array.from({ length: count }, (_, i) => Math.floor(i / perHole) + 1);

const SHUFFLE = { partyAssignmentMethod: 'シャッフル' } as const;

/** 144名（V14）の生年月日・スコア */
const bigBirth = (i: number) => `${1930 + (i % 47)}/${1 + (i % 12)}/${1 + (i % 28)}`;
const bigTotal = (i: number) => 16 + (i % 50);

export const SAMPLES: Sample[] = [
  {
    id: 'I-VAR-01',
    title: '最小構成（2名・1パーティ・個人戦・シャッフル）',
    competition: { ...SHUFFLE },
    players: [pl('Aさん', '1970/01/01'), pl('Bさん', '1980/01/01')],
    scores: { Aさん: [T(30)], Bさん: [T(28)] },
    expect: {
      parties: [[1, 2]],
      startHoles: [1],
      individual: [
        [1, 'Bさん', 28],
        [2, 'Aさん', 30],
      ],
      excluded: [],
    },
  },
  {
    id: 'I-VAR-02',
    title: '1パーティに最大人数6名ちょうど（チーム方式・同一チーム6名）',
    competition: { partyAssignmentMethod: 'チーム', maxPartySize: 6 },
    players: many(6, '東', (i) => ({ teamName: '東', birthDate: `${1950 + i}/04/01` })),
    scores: Object.fromEntries(Array.from({ length: 6 }, (_, k) => [`東00${k + 1}`, [T(20 + k)]])),
    expect: {
      parties: [[1, 6]],
      startHoles: [1],
      individual: Array.from({ length: 6 }, (_, k): IndividualExpect => [k + 1, `東00${k + 1}`, 20 + k]),
    },
  },
  {
    id: 'I-VAR-03',
    title: 'チーム方式で同一チーム7名（最大人数超過）は生成エラー',
    competition: { partyAssignmentMethod: 'チーム', maxPartySize: 6 },
    players: many(7, '東', () => ({ teamName: '東' })),
    expect: {
      pairingError:
        'チーム『東』の人数がパーティの最大人数を超えています。選手情報またはパーティの最大人数を見直してください。',
    },
  },
  {
    id: 'I-VAR-04',
    title: 'シャッフル・最大4名・10名・2ラウンド（人数の平均化と2ラウンド合算）',
    competition: { ...SHUFFLE, maxPartySize: 4, rounds: 2 },
    players: many(10, 'S', (i) => ({ birthDate: `1960/01/${String(i).padStart(2, '0')}` })),
    scores: Object.fromEntries(
      Array.from({ length: 10 }, (_, k) => {
        const i = k + 1;
        return [`S${String(i).padStart(3, '0')}`, [T(20 + i), T(20 + (i % 3))]];
      }),
    ),
    expect: {
      parties: [
        [1, 4],
        [2, 3],
        [3, 3],
      ],
      startHoles: [1, 2, 3],
      individual: [
        [1, 'S001', 42],
        [2, 'S003', 43],
        [3, 'S002', 44],
        [4, 'S004', 45],
        [5, 'S006', 46],
        [6, 'S005', 47],
        [7, 'S007', 48],
        [8, 'S009', 49],
        [9, 'S008', 50],
        [10, 'S010', 51],
      ],
    },
  },
  {
    id: 'I-VAR-05',
    title: '3ラウンド・チーム方式・3チーム、ホールインワン（変換-2）を含む',
    competition: { partyAssignmentMethod: 'チーム', maxPartySize: 4, rounds: 3 },
    players: [
      pl('赤1', '1950/01/01', '赤'),
      pl('赤2', '1955/05/05', '赤'),
      pl('赤3', '1970/01/01', '赤'),
      pl('白1', '1960/06/06', '白'),
      pl('白2', '1965/01/01', '白'),
      pl('青1', '1980/01/01', '青'),
    ],
    scores: {
      赤1: [[1, 3, 3, 3, 3, 3, 3, 3], T(20), T(20)], // 19+20+20=59
      赤2: [T(20), T(20), T(18)], // 58
      赤3: [T(21), T(21), T(21)], // 63
      白1: [[1, 1, 3, 3, 3, 3, 3, 3], T(22), T(22)], // 14+22+22=58
      白2: [T(19), T(19), T(19)], // 57
      青1: [T(25), T(25), T(25)], // 75
    },
    expect: {
      parties: [
        [1, 3],
        [2, 2],
        [3, 1],
      ],
      startHoles: [1, 2, 3],
      members: { 1: ['赤1', '赤2', '赤3'], 2: ['白1', '白2'], 3: ['青1'] },
      individual: [
        [1, '白2', 57],
        [2, '赤2', 58],
        [3, '白1', 58],
        [4, '赤1', 59],
        [5, '赤3', 63],
        [6, '青1', 75],
      ],
      cells: { 赤1: ['1(-2)', '3', '3', '3', '3', '3', '3', '3'], 白1: ['1(-2)', '1(-2)', '3', '3', '3', '3', '3', '3'] },
    },
  },
  {
    id: 'I-VAR-06',
    title: 'ラウンド数5（上限）・総合スコア同点かつ同じ生年月日はじゃんけん待ち',
    competition: { ...SHUFFLE, rounds: 5 },
    players: [pl('Aさん', '1960/01/01'), pl('Bさん', '1960/01/01')],
    scores: { Aさん: [T(20), T(20), T(20), T(20), T(20)], Bさん: [T(19), T(21), T(20), T(20), T(20)] },
    expect: {
      individual: [
        [1, 'Aさん', 100, true],
        [1, 'Bさん', 100, true],
      ],
    },
  },
  {
    id: 'I-VAR-07',
    title: 'チーム戦（平均）：人数の異なるチーム・平均が小数',
    competition: { ...SHUFFLE, teamBattleEnabled: true, teamRankingMethod: '平均' },
    players: [
      pl('A1', '1960/01/01', 'A組'),
      pl('A2', '1950/01/01', 'A組'),
      pl('A3', '1960/03/03', 'A組'),
      pl('B1', '1951/01/01', 'B組'),
      pl('B2', '1960/02/02', 'B組'),
      pl('C1', '1952/01/01', 'C組'),
    ],
    scores: { A1: [T(30)], A2: [T(31)], A3: [T(33)], B1: [T(31)], B2: [T(32)], C1: [T(31)] },
    expect: {
      parties: [[1, 6]],
      individual: [
        [1, 'A1', 30],
        [2, 'A2', 31],
        [3, 'B1', 31],
        [4, 'C1', 31],
        [5, 'B2', 32],
        [6, 'A3', 33],
      ],
      team: [
        [1, 'C組', 1, 31],
        [2, 'A組', 3, 94],
        [3, 'B組', 2, 63],
      ],
      // 開催日2026/11/16：C1=74歳319日、A組=66歳319日+76歳319日+66歳258日、B組=75歳319日+66歳287日
      teamRows: [
        ['1', 'C組', '1', '31', '74歳319日'],
        ['2', 'A組', '3', '31.33', '208歳896日'],
        ['3', 'B組', '2', '31.5', '141歳606日'],
      ],
    },
  },
  {
    id: 'I-VAR-08',
    title: 'チーム戦（合計）：人数の多いチームは合計で不利になる（平均とは順位が逆転）',
    competition: { ...SHUFFLE, teamBattleEnabled: true, teamRankingMethod: '合計' },
    players: [
      pl('X1', '1940/01/01', 'X組'),
      pl('X2', '1941/01/01', 'X組'),
      pl('X3', '1942/01/01', 'X組'),
      pl('Y1', '1945/01/01', 'Y組'),
      pl('Y2', '1946/01/01', 'Y組'),
    ],
    scores: { X1: [T(20)], X2: [T(20)], X3: [T(20)], Y1: [T(25)], Y2: [T(25)] },
    expect: {
      individual: [
        [1, 'X1', 20],
        [2, 'X2', 20],
        [3, 'X3', 20],
        [4, 'Y1', 25],
        [5, 'Y2', 25],
      ],
      team: [
        [1, 'Y組', 2, 50],
        [2, 'X組', 3, 60],
      ],
    },
  },
  {
    id: 'I-VAR-09',
    title: 'チーム戦（平均）：平均同点は合計年齢が上、合計年齢も同じならじゃんけん待ち',
    competition: { ...SHUFFLE, teamBattleEnabled: true, teamRankingMethod: '平均' },
    players: [
      pl('松1', '1950/01/01', '松'),
      pl('松2', '1950/01/01', '松'),
      pl('竹1', '1960/01/01', '竹'),
      pl('竹2', '1960/01/01', '竹'),
      pl('梅1', '1970/01/01', '梅'),
      pl('梅2', '1970/01/01', '梅'),
      pl('桜1', '1970/01/01', '桜'),
      pl('桜2', '1970/01/01', '桜'),
    ],
    scores: {
      松1: [T(30)],
      松2: [T(32)],
      竹1: [T(31)],
      竹2: [T(31)],
      梅1: [T(33)],
      梅2: [T(33)],
      桜1: [T(32)],
      桜2: [T(34)],
    },
    expect: {
      parties: [
        [1, 4],
        [2, 4],
      ],
      individualCount: 8,
      team: [
        [1, '松', 2, 62],
        [2, '竹', 2, 62],
        [3, '梅', 2, 66, true],
        [3, '桜', 2, 66, true],
      ],
    },
  },
  {
    id: 'I-VAR-10',
    title: 'チーム戦（合計）・2ラウンド：未入力ラウンドのある選手はチーム集計から除外、全員除外のチームは表示しない',
    competition: { ...SHUFFLE, maxPartySize: 1, rounds: 2, teamBattleEnabled: true, teamRankingMethod: '合計' },
    players: [
      pl('東1', '1950/01/01', '東'),
      pl('東2', '1951/01/01', '東'),
      pl('西1', '1960/01/01', '西'),
      pl('西2', '1961/01/01', '西'),
      pl('南1', '1970/01/01', '南'),
    ],
    scores: {
      東1: [T(20), T(20)],
      東2: [T(16)],
      西1: [T(22), T(22)],
      西2: [T(18), T(18)],
      南1: [T(16)],
    },
    expect: {
      startHoles: [1, 2, 3, 4, 5],
      individual: [
        [1, '西2', 36],
        [2, '東1', 40],
        [3, '西1', 44],
      ],
      team: [
        [1, '東', 1, 40],
        [2, '西', 2, 80],
      ],
      excluded: ['東2', '南1'],
    },
  },
  {
    id: 'I-VAR-11',
    title: '20パーティ（チーム方式・6名×20チーム＝120名）：開始ホール1〜6は3パーティ、7は2パーティ',
    competition: { partyAssignmentMethod: 'チーム', maxPartySize: 6 },
    players: Array.from({ length: 20 }, (_, t) =>
      Array.from({ length: 6 }, (_, k) =>
        pl(`T${String(t + 1).padStart(2, '0')}-${k + 1}`, `${1940 + t}/0${k + 1}/15`, `T${String(t + 1).padStart(2, '0')}`),
      ),
    ).flat(),
    expect: {
      parties: Array.from({ length: 20 }, (_, i): [number, number] => [i + 1, 6]),
      startHoles: holes(20, 3),
      members: { 1: ['T01-1', 'T01-6'], 20: ['T20-1', 'T20-6'] },
    },
  },
  {
    id: 'I-VAR-12',
    title: '21パーティ（シャッフル・最大6名・125名）：開始ホール1〜7を3パーティずつ、最後のパーティのみ5名',
    competition: { ...SHUFFLE, maxPartySize: 6 },
    players: many(125, 'P'),
    expect: {
      parties: Array.from({ length: 21 }, (_, i): [number, number] => [i + 1, i < 20 ? 6 : 5]),
      startHoles: holes(21, 3),
    },
  },
  {
    id: 'I-VAR-13',
    title: '24パーティ（シャッフル・最大1名・24名）：開始ホール1〜8を3パーティずつ',
    competition: { ...SHUFFLE, maxPartySize: 1 },
    players: many(24, 'Q'),
    expect: {
      parties: Array.from({ length: 24 }, (_, i): [number, number] => [i + 1, 1]),
      startHoles: holes(24, 3),
    },
  },
  {
    id: 'I-VAR-14',
    title: '大人数144名（シャッフル・最大6名・24パーティ）：全員のスコア入力と順位表作成（性能：生成・作成とも3秒以内）',
    competition: { ...SHUFFLE, maxPartySize: 6 },
    players: many(144, 'M', (i) => ({ birthDate: bigBirth(i) })),
    scores: Object.fromEntries(
      Array.from({ length: 144 }, (_, k) => [`M${String(k + 1).padStart(3, '0')}`, [T(bigTotal(k + 1))]]),
    ),
    expect: {
      parties: Array.from({ length: 24 }, (_, i): [number, number] => [i + 1, 6]),
      startHoles: holes(24, 3),
      individualCount: 144,
      // 最小スコア16は i=50（1933/3/23生）と i=100（1936/5/17生）→ 年上の M050 が1位
      individual: [
        [1, 'M050', 16],
        [2, 'M100', 16],
      ],
    },
  },
  {
    id: 'I-VAR-15',
    title: '8パーティ（シャッフル・最大1名）：開始ホール1〜8を1パーティずつ',
    competition: { ...SHUFFLE, maxPartySize: 1 },
    players: many(8, 'R'),
    expect: { startHoles: holes(8, 1) },
  },
  {
    id: 'I-VAR-16',
    title: '17パーティ（シャッフル・最大1名）：商3・使用ホール6、最後の開始ホールのみ2パーティ',
    competition: { ...SHUFFLE, maxPartySize: 1 },
    players: many(17, 'U'),
    expect: { startHoles: holes(17, 3) },
  },
  {
    id: 'I-VAR-17',
    title: '生年月日の各種入力形式（西暦ゼロ埋めなし・和暦S/H/R・小文字・元号の境界日・前後の空白）',
    competition: { ...SHUFFLE },
    players: [
      pl('西暦ゼロなし', '1971/5/24'),
      pl('昭和', 'S46.05.24'),
      pl('昭和小文字', 's46.5.24'),
      pl('昭和元年初日', 'S1.12.25'),
      pl('昭和最終日', 'S64.01.07'),
      pl('平成初日', 'h1.1.8'),
      pl('平成最終日', 'H31.04.30'),
      pl('令和初日', 'R1.5.1'),
      pl('令和7年', 'r07.11.16'),
      pl('前後空白', ' 1950/01/01 '),
    ],
    expect: {
      birthDates: {
        西暦ゼロなし: '1971-05-24',
        昭和: '1971-05-24',
        昭和小文字: '1971-05-24',
        昭和元年初日: '1926-12-25',
        昭和最終日: '1989-01-07',
        平成初日: '1989-01-08',
        平成最終日: '2019-04-30',
        令和初日: '2019-05-01',
        令和7年: '2025-11-16',
        前後空白: '1950-01-01',
      },
      ages: { 昭和元年初日: '99歳326日', 令和7年: '1歳0日', 昭和: '55歳176日' },
    },
  },
  ...(
    [
      ['I-VAR-18', '2026-02-28', { 前日さん: '26歳0日', 閏日さん: '25歳364日', 翌日さん: '25歳364日' }],
      ['I-VAR-19', '2026-03-01', { 前日さん: '26歳1日', 閏日さん: '26歳0日', 翌日さん: '26歳0日' }],
      ['I-VAR-20', '2028-02-29', { 前日さん: '28歳1日', 閏日さん: '28歳0日', 翌日さん: '27歳365日' }],
    ] as const
  ).map(
    ([id, date, ages]): Sample => ({
      id,
      title: `うるう日（2/29）生まれ・開催日${date.replace(/-/g, '/')}：年齢表示と、同スコアでの生年月日による順位`,
      tournament: { date },
      competition: { ...SHUFFLE },
      players: [pl('閏日さん', '2000/02/29'), pl('前日さん', '2000/2/28'), pl('翌日さん', 'H12.03.01')],
      scores: { 閏日さん: [T(30)], 前日さん: [T(30)], 翌日さん: [T(30)] },
      expect: {
        birthDates: { 閏日さん: '2000-02-29', 前日さん: '2000-02-28', 翌日さん: '2000-03-01' },
        ages: { ...ages },
        individual: [
          [1, '前日さん', 30],
          [2, '閏日さん', 30],
          [3, '翌日さん', 30],
        ],
      },
    }),
  ),
  {
    id: 'I-VAR-21',
    title: '同スコア・同生年月日のじゃんけん待ち（3名組・2名組）と手動確定',
    competition: { ...SHUFFLE },
    players: [
      pl('先頭', '1960/01/01'),
      pl('甲', '1955/05/05'),
      pl('乙', '1955/05/05'),
      pl('丙', '1955/05/05'),
      pl('丁', '1940/01/01'),
      pl('戊', '1970/07/07'),
      pl('己', '1970/07/07'),
    ],
    scores: { 先頭: [T(20)], 甲: [T(25)], 乙: [T(25)], 丙: [T(25)], 丁: [T(30)], 戊: [T(35)], 己: [T(35)] },
    expect: {
      parties: [
        [1, 4],
        [2, 3],
      ],
      individual: [
        [1, '先頭', 20],
        [2, '甲', 25, true],
        [2, '乙', 25, true],
        [2, '丙', 25, true],
        [5, '丁', 30],
        [6, '戊', 35, true],
        [6, '己', 35, true],
      ],
    },
  },
  {
    id: 'I-VAR-22',
    title: '同スコア・生年月日が1日違い（年上が上位、じゃんけん待ちにならない）',
    competition: { ...SHUFFLE },
    players: [pl('一月一日', '1950/01/01'), pl('一月二日', '1950/01/02'), pl('大晦日', '1949/12/31')],
    scores: { 一月一日: [T(30)], 一月二日: [T(30)], 大晦日: [T(30)] },
    expect: {
      individual: [
        [1, '大晦日', 30],
        [2, '一月一日', 30],
        [3, '一月二日', 30],
      ],
    },
  },
  ...(
    [
      ['I-VAR-23', '変換値-5（下限）', { holeInOneConversionValue: -5 }, 8, '1(-5)'],
      ['I-VAR-24', '変換値1（上限。打数1のまま）', { holeInOneConversionValue: 1 }, 20, '1'],
      ['I-VAR-25', '変換値0', { holeInOneConversionValue: 0 }, 18, '1(0)'],
      ['I-VAR-26', '変換なし', { holeInOneConversionEnabled: false, holeInOneConversionValue: null }, 20, '1'],
    ] as const
  ).map(
    ([id, label, conv, totalA, cell]): Sample => ({
      id,
      title: `ホールインワン：${label}で打数1を置き換えて集計する`,
      competition: { ...SHUFFLE, ...conv },
      players: [pl('Aさん', '1960/01/01'), pl('Bさん', '1950/01/01')],
      // Aさん：ホール1・2がホールインワン、他は3（素の合計20）。Bさん：全ホール2（16）
      scores: { Aさん: [[1, 1, 3, 3, 3, 3, 3, 3]], Bさん: [[2, 2, 2, 2, 2, 2, 2, 2]] },
      expect: {
        individual:
          totalA < 16
            ? [
                [1, 'Aさん', totalA],
                [2, 'Bさん', 16],
              ]
            : [
                [1, 'Bさん', 16],
                [2, 'Aさん', totalA],
              ],
        cells: { Aさん: [cell, cell, '3', '3', '3', '3', '3', '3'] },
      },
    }),
  ),
  {
    id: 'I-VAR-27',
    title: '全ホールホールインワン（合計がマイナス）と打数上限99（全ホール99）',
    competition: { ...SHUFFLE },
    players: [pl('全部一打', '1960/01/01'), pl('全部九十九', '1960/01/01'), pl('普通', '1960/01/01')],
    scores: { 全部一打: [Array(8).fill(1)], 全部九十九: [Array(8).fill(99)], 普通: [T(30)] },
    expect: {
      individual: [
        [1, '全部一打', -16],
        [2, '普通', 30],
        [3, '全部九十九', 792],
      ],
      cells: { 全部一打: Array(8).fill('1(-2)'), 全部九十九: Array(8).fill('99') },
    },
  },
  {
    id: 'I-VAR-28',
    title: '不参加の選手は組合せ表・順位表・集計対象外一覧のいずれにも含まれない',
    competition: { ...SHUFFLE },
    players: [
      pl('参加A', '1960/01/01'),
      pl('不参加D', '1960/01/01', '', { absent: true }),
      pl('参加B', '1961/01/01'),
      pl('参加C', '1962/01/01'),
      pl('不参加E', '1960/01/01', '', { absent: true }),
    ],
    scores: { 参加A: [T(30)], 参加B: [T(29)], 参加C: [T(31)] },
    expect: {
      parties: [[1, 3]],
      individual: [
        [1, '参加B', 29],
        [2, '参加A', 30],
        [3, '参加C', 31],
      ],
      excluded: [],
    },
  },
  {
    id: 'I-VAR-29',
    title: '不参加により参加選手が1名になる場合は生成エラー',
    competition: { ...SHUFFLE },
    players: [pl('参加A', '1960/01/01'), pl('不参加B', '1960/01/01', '', { absent: true })],
    expect: {
      pairingError: '参加選手数が2名未満のため組合せ表を作成できません。選手を2名以上登録してください。',
    },
  },
  {
    id: 'I-VAR-30',
    title: '固定パーティ（シャッフル・飛び番号3と5・最大4名・10名）：新規パーティは1から採番し人数を平均化',
    competition: { ...SHUFFLE, maxPartySize: 4 },
    players: [
      pl('固定3a', '1960/01/01', '', fixedAt(3)),
      pl('固定3b', '1960/01/01', '', fixedAt(3)),
      pl('固定5a', '1960/01/01', '', fixedAt(5)),
      ...many(7, '非固定'),
    ],
    expect: {
      parties: [
        [1, 3],
        [3, 4],
        [5, 3],
      ],
      startHoles: [1, 2, 3],
      members: { 3: ['固定3a', '固定3b'], 5: ['固定5a'] },
    },
  },
  {
    id: 'I-VAR-31',
    title: '固定パーティ（チーム方式・最大4名）：空き枠には固定選手と同じチームを優先して入れる',
    competition: { partyAssignmentMethod: 'チーム', maxPartySize: 4 },
    players: [
      pl('B1', '1960/01/01', 'B'),
      pl('B2', '1960/01/01', 'B'),
      pl('B3', '1960/01/01', 'B'),
      pl('固定A', '1960/01/01', 'A', fixedAt(2)),
      pl('A2', '1960/01/01', 'A'),
      pl('A3', '1960/01/01', 'A'),
      pl('C1', '1960/01/01', 'C'),
      pl('C2', '1960/01/01', 'C'),
      pl('C3', '1960/01/01', 'C'),
      pl('C4', '1960/01/01', 'C'),
    ],
    expect: {
      parties: [
        [1, 3],
        [2, 3],
        [3, 4],
      ],
      startHoles: [1, 2, 3],
      members: { 1: ['B1', 'B2', 'B3'], 2: ['固定A', 'A2', 'A3'], 3: ['C1', 'C4'] },
    },
  },
  {
    id: 'I-VAR-32',
    title: 'パーティ番号99（上限）の固定：空き枠に収まるチームが入り、残りのチームは1から採番',
    competition: { partyAssignmentMethod: 'チーム', maxPartySize: 6 },
    players: [
      pl('九十九', '1960/01/01', '本部', fixedAt(99)),
      pl('東1', '1960/01/01', '東'),
      pl('東2', '1960/01/01', '東'),
      pl('西1', '1960/01/01', '西'),
      pl('西2', '1960/01/01', '西'),
      pl('西3', '1960/01/01', '西'),
    ],
    expect: {
      parties: [
        [1, 3],
        [99, 3],
      ],
      startHoles: [1, 2],
      members: { 1: ['西1', '西2', '西3'], 99: ['九十九', '東1', '東2'] },
    },
  },
  {
    id: 'I-VAR-33',
    title: '同じパーティ番号の固定選手が最大人数を超える場合は生成エラー',
    competition: { ...SHUFFLE, maxPartySize: 2 },
    players: [
      pl('固定1', '1960/01/01', '', fixedAt(1)),
      pl('固定2', '1960/01/01', '', fixedAt(1)),
      pl('固定3', '1960/01/01', '', fixedAt(1)),
      pl('非固定', '1960/01/01'),
    ],
    expect: {
      pairingError: 'パーティ番号1の人数がパーティの最大人数を超えています。選手情報のパーティ番号を見直してください。',
    },
  },
  {
    id: 'I-VAR-34',
    title: '全角・半角カナ・サロゲートペアを含む名前と文字数上限ちょうど（大会名・開催場所50文字、選手名・チーム名10文字）',
    tournament: { name: '𠮷'.repeat(5) + 'グ'.repeat(45), place: '𩸽'.repeat(2) + '会場'.repeat(24) },
    competition: { ...SHUFFLE, teamBattleEnabled: true, teamRankingMethod: '合計' },
    players: [
      pl('𠮷田𠮷子さん一二三四', '1950/01/01', '𩸽𩸽チーム１２３４５'),
      pl('ｱｲｳｴｵｶｷｸｹｺ', '1951/01/01', '𩸽𩸽チーム１２３４５'),
      pl('⛳ゴルフ太郎', '1952/01/01', 'ﾊﾝｶｸﾁｰﾑ'),
      pl('Ａｂｃ　ＤＥＦ', '1953/01/01', 'ﾊﾝｶｸﾁｰﾑ'),
    ],
    scores: {
      '𠮷田𠮷子さん一二三四': [T(20)],
      ｱｲｳｴｵｶｷｸｹｺ: [T(21)],
      '⛳ゴルフ太郎': [T(22)],
      'Ａｂｃ　ＤＥＦ': [T(23)],
    },
    expect: {
      individual: [
        [1, '𠮷田𠮷子さん一二三四', 20],
        [2, 'ｱｲｳｴｵｶｷｸｹｺ', 21],
        [3, '⛳ゴルフ太郎', 22],
        [4, 'Ａｂｃ　ＤＥＦ', 23],
      ],
      team: [
        [1, '𩸽𩸽チーム１２３４５', 2, 41],
        [2, 'ﾊﾝｶｸﾁｰﾑ', 2, 45],
      ],
    },
  },
  {
    id: 'I-VAR-35',
    title: '誕生日当日の開催（当日から新しい年齢）と前日生まれとの順位',
    competition: { ...SHUFFLE },
    players: [pl('翌日生まれ', '1960/11/17'), pl('当日生まれ', '1960/11/16')],
    scores: { 翌日生まれ: [T(30)], 当日生まれ: [T(30)] },
    expect: {
      ages: { 当日生まれ: '66歳0日', 翌日生まれ: '65歳364日' },
      individual: [
        [1, '当日生まれ', 30],
        [2, '翌日生まれ', 30],
      ],
    },
  },
  {
    id: 'I-VAR-36',
    title: '3ラウンド・個人戦：一部ラウンド未入力・全ラウンド未入力の選手は集計対象外（登録順で注記）',
    competition: { ...SHUFFLE, maxPartySize: 1, rounds: 3 },
    players: [pl('全入力A', '1960/01/01'), pl('二R止まり', '1960/01/01'), pl('未入力', '1960/01/01'), pl('全入力D', '1950/01/01')],
    scores: { 全入力A: [T(20), T(20), T(20)], 二R止まり: [T(16), T(16)], 全入力D: [T(21), T(20), T(19)] },
    expect: {
      individual: [
        [1, '全入力D', 60],
        [2, '全入力A', 60],
      ],
      excluded: ['二R止まり', '未入力'],
    },
  },
];
