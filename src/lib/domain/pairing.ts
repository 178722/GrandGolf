// 組合せ表（パーティ編成）の自動生成と開始ホールの自動割当（要件定義書3.4）

import type { Competition, Player } from '@/types/tournament';

export const HOLE_COUNT = 8;

export type GeneratedParty = { partyNumber: number; startHole: number; playerIds: string[] };

export type PairingResult = { ok: true; parties: GeneratedParty[] } | { ok: false; message: string };

export const PAIRING_MESSAGES = {
  resultsExist: '試合結果が入力されています。試合結果を削除して下さい。',
  noCompetition: '競技情報が登録されていません。競技情報を登録してください。',
  tooFewPlayers: '参加選手数が2名未満のため組合せ表を作成できません。選手を2名以上登録してください。',
  fixedOverflow: (partyNumber: number) =>
    `パーティ番号${partyNumber}の人数がパーティの最大人数を超えています。選手情報のパーティ番号を見直してください。`,
  missingTeamName: 'チーム名が未入力の選手がいます。選手情報を見直してください。',
  teamOverflow: (teamName: string) =>
    `チーム『${teamName}』の人数がパーティの最大人数を超えています。選手情報またはパーティの最大人数を見直してください。`,
} as const;

/** 0以上1未満の乱数を返す関数（テスト時に差し替え可能にする） */
export type Rng = () => number;

/** Fisher–Yates による並べ替え（元配列は変更しない） */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 開始ホールの自動割当。パーティ番号順に並んだ partyCount 件のパーティに対し、開始ホールを順に返す。
 * 1. 商 = ceil(全パーティ数 ÷ 8)
 * 2. 使用する開始ホール数 = ceil(全パーティ数 ÷ 商)
 * 3. パーティ番号順に商の数ごとに区切り、開始ホール1番から順に割り当てる
 */
export function assignStartHoles(partyCount: number): number[] {
  if (partyCount <= 0) return [];
  const perHole = Math.ceil(partyCount / HOLE_COUNT);
  return Array.from({ length: partyCount }, (_, i) => Math.floor(i / perHole) + 1);
}

/**
 * 開始グループ。同じ開始ホールのパーティに、パーティ番号の小さい順で1, 2, 3…と付ける
 * （開始ホールを1パーティだけで使う場合は1）。保存はせず、表示時に開始ホールから算出する。
 * 戻り値はパーティ番号 → 開始グループ。
 */
export function assignStartGroups(
  parties: readonly { partyNumber: number; startHole: number }[],
): Map<number, number> {
  const groups = new Map<number, number>();
  const countByHole = new Map<number, number>();
  for (const p of [...parties].sort((a, b) => a.partyNumber - b.partyNumber)) {
    const n = (countByHole.get(p.startHole) ?? 0) + 1;
    countByHole.set(p.startHole, n);
    groups.set(p.partyNumber, n);
  }
  return groups;
}

/**
 * 開始ホールの手動変更で選択できない開始ホール。
 * 対象パーティと同じ開始グループ（変更前の開始グループ）の他パーティに、既に割り当ててある開始ホールは選択できない。
 * 戻り値は開始ホール → そのホールを使用しているパーティ番号（対象パーティ自身の現在の開始ホールは含まない）。
 */
export function unavailableStartHoles(
  parties: readonly { partyNumber: number; startHole: number }[],
  partyNumber: number,
): Map<number, number> {
  const groups = assignStartGroups(parties);
  const group = groups.get(partyNumber);
  const result = new Map<number, number>();
  if (group === undefined) return result;
  for (const p of parties) {
    if (p.partyNumber !== partyNumber && groups.get(p.partyNumber) === group) result.set(p.startHole, p.partyNumber);
  }
  return result;
}

/**
 * パーティ編成を生成する（試合結果の有無は呼び出し側で判定する）。
 * players は登録順に並んでいること（チームの採番順・パーティ内の並び順に使用する）。
 * 不参加の選手は組合せの対象から除外する。
 */
export function generatePairings(
  allPlayers: readonly Player[],
  competition: Pick<Competition, 'maxPartySize' | 'partyAssignmentMethod'> | null,
  rng: Rng = Math.random,
): PairingResult {
  if (!competition) return { ok: false, message: PAIRING_MESSAGES.noCompetition };
  const players = allPlayers.filter((p) => !p.absent);
  if (players.length < 2) return { ok: false, message: PAIRING_MESSAGES.tooFewPlayers };

  const max = competition.maxPartySize;
  // パーティ番号のない「固定」は不整合データのため、非固定として扱い組合せ表から漏らさない
  const isFixed = (p: Player) => p.partyFixed && p.partyNumber !== null;

  // 1. 固定選手は指定パーティ番号へそのまま確定
  const fixed = new Map<number, string[]>();
  for (const p of players) {
    if (isFixed(p) && p.partyNumber !== null) {
      const list = fixed.get(p.partyNumber) ?? [];
      list.push(p.id);
      fixed.set(p.partyNumber, list);
    }
  }
  const fixedNumbers = [...fixed.keys()].sort((a, b) => a - b);
  for (const n of fixedNumbers) {
    if ((fixed.get(n) as string[]).length > max) return { ok: false, message: PAIRING_MESSAGES.fixedOverflow(n) };
  }

  // 2. 非固定選手の割り当て
  const unfixed = players.filter((p) => !isFixed(p));
  const parties: { partyNumber: number; playerIds: string[] }[] = fixedNumbers.map((n) => ({
    partyNumber: n,
    playerIds: [...(fixed.get(n) as string[])],
  }));
  // 固定選手が使用していないパーティ番号を1番から順に採番する
  const used = new Set(fixedNumbers);
  let next = 1;
  const newParty = (playerIds: string[]) => {
    while (used.has(next)) next++;
    used.add(next);
    const party = { partyNumber: next, playerIds };
    parties.push(party);
    return party;
  };

  if (competition.partyAssignmentMethod === 'チーム') {
    // チーム：同一チーム名の非固定選手を1チームとしてまとめ、チームを分割せずに振り分ける
    if (unfixed.some((p) => !p.teamName.trim())) return { ok: false, message: PAIRING_MESSAGES.missingTeamName };
    const byTeam = new Map<string, string[]>();
    for (const p of unfixed) {
      const key = p.teamName.trim();
      const list = byTeam.get(key) ?? [];
      list.push(p.id);
      byTeam.set(key, list);
    }
    for (const [team, ids] of byTeam) {
      if (ids.length > max) return { ok: false, message: PAIRING_MESSAGES.teamOverflow(team) };
    }
    // 固定パーティ（番号順）ごとに、空き枠（最大人数－現在の人数）に収まるチームを1チームだけ入れる。
    // 固定選手と同じチーム名のチームを優先し、なければ登録順で最初に収まるチームとする
    const remaining = [...byTeam.entries()].map(([name, ids]) => ({ name, ids }));
    const teamOf = new Map(players.map((p) => [p.id, p.teamName.trim()]));
    for (const party of parties) {
      const space = max - party.playerIds.length;
      const fits = remaining.filter((t) => t.ids.length <= space);
      if (fits.length === 0) continue;
      const own = new Set(party.playerIds.map((id) => teamOf.get(id)));
      const pick = fits.find((t) => own.has(t.name)) ?? fits[0];
      party.playerIds.push(...pick.ids);
      remaining.splice(remaining.indexOf(pick), 1);
    }
    // 固定パーティに入らなかったチームは、1チーム＝1パーティで新規採番する
    for (const t of remaining) newParty(t.ids);
  } else {
    // シャッフル：パーティ数 ＝ max(全選手数 ÷ 最大人数 の切り上げ, 固定パーティ数)。
    // 不足分は新規パーティとし、ランダムに並べた非固定選手を「その時点で人数が最も少ないパーティ」へ
    // 1名ずつ入れることで、各パーティの人数を平均（全選手数 ÷ パーティ数）に揃える。
    // 同数のときは固定パーティ → パーティ番号の小さい順を優先する。チーム名は考慮しない。
    const partyCount = Math.max(Math.ceil(players.length / max), fixedNumbers.length);
    const fixedSet = new Set(fixedNumbers);
    while (parties.length < partyCount) newParty([]);
    for (const id of shuffle(
      unfixed.map((p) => p.id),
      rng,
    )) {
      let target = parties[0];
      for (const party of parties) {
        const fewer = party.playerIds.length < target.playerIds.length;
        const tie = party.playerIds.length === target.playerIds.length;
        const preferred =
          (fixedSet.has(party.partyNumber) && !fixedSet.has(target.partyNumber)) ||
          (fixedSet.has(party.partyNumber) === fixedSet.has(target.partyNumber) &&
            party.partyNumber < target.partyNumber);
        if (fewer || (tie && preferred)) target = party;
      }
      target.playerIds.push(id);
    }
  }

  // 念のため空のパーティは除外する（計算上は発生しない）
  const nonEmpty = parties.filter((p) => p.playerIds.length > 0);
  nonEmpty.sort((a, b) => a.partyNumber - b.partyNumber);
  const holes = assignStartHoles(nonEmpty.length);
  return { ok: true, parties: nonEmpty.map((p, i) => ({ ...p, startHole: holes[i] })) };
}
