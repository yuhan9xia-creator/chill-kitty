/**
 * Keep or Discard guidance for each food item.
 * Data from docs/keep_or_discard.md
 */

interface KeepOrDiscard {
  keep: { en: string; cn: string };
  discard: { en: string; cn: string };
}

export const KEEP_OR_DISCARD: Record<string, KeepOrDiscard> = {
  potato: {
    keep: { en: 'Slight sprouting, still firm', cn: '轻微发芽、仍结实' },
    discard: { en: 'Green skin, soft rot, mold', cn: '发绿、软烂、发霉' },
  },
  onion: {
    keep: { en: 'Dry skin, slight sprouting', cn: '表皮干、略出芽' },
    discard: { en: 'Soft, slimy, moldy', cn: '发软、黏烂、发霉' },
  },
  garlic: {
    keep: { en: 'Slightly dry, cloves still firm', cn: '略干、蒜瓣结实' },
    discard: { en: 'Soft, moldy, leaking', cn: '发软、发霉、渗水' },
  },
  sweet_potato: {
    keep: { en: 'Dry skin, still firm', cn: '表皮干、仍结实' },
    discard: { en: 'Soft, black spots, mold', cn: '软塌、发黑、发霉' },
  },
  rice: {
    keep: { en: 'Dry, no unusual smell', cn: '干燥、无异味' },
    discard: { en: 'Damp, insects, mold', cn: '受潮、长虫、发霉' },
  },
  banana: {
    keep: { en: 'Brown spots, soft, fully ripe', cn: '褐点、变软、熟透' },
    discard: { en: 'Mold, leaking, fermented smell', cn: '发霉、漏汁、酒味' },
  },
  orange: {
    keep: { en: 'Slightly wrinkled, still firm', cn: '略皱、仍结实' },
    discard: { en: 'Mold, soft rot, leaking', cn: '发霉、软烂、渗水' },
  },
  lemon: {
    keep: { en: 'Slightly wrinkled, still firm', cn: '略皱、仍较硬' },
    discard: { en: 'Mold, soft rot, unusual smell', cn: '发霉、软烂、异味' },
  },
  apple: {
    keep: { en: 'Light bruising, slight soft spots', cn: '轻微碰伤、局部变软' },
    discard: { en: 'Large soft areas, mold, fermented smell', cn: '大面积软烂、发霉、酒味' },
  },
  watermelon: {
    keep: { en: 'Fresh cut surface, no off smell', cn: '切面新鲜、无异味' },
    discard: { en: 'Slimy, sour, moldy', cn: '发黏、发酸、发霉' },
  },
  tomato: {
    keep: { en: 'Ripe and soft, no cracks', cn: '成熟变软、无裂口' },
    discard: { en: 'Leaking, mold, sour smell', cn: '漏汁、发霉、酸臭' },
  },
  pineapple: {
    keep: { en: 'Ripe, normal sweet smell', cn: '熟透、香味正常' },
    discard: { en: 'Leaking bottom, mold, sour smell', cn: '底部漏汁、发霉、酸味' },
  },
  rye_bread: {
    keep: { en: 'Dry, hard', cn: '变干、变硬' },
    discard: { en: 'Any mold, damp and sticky', cn: '任何霉点、潮湿发黏' },
  },
  carrot: {
    keep: { en: 'Slightly soft, not slimy', cn: '略微软、无黏液' },
    discard: { en: 'Slimy, dark spots, mold', cn: '发黏、发黑、发霉' },
  },
  ginger: {
    keep: { en: 'Slightly dry, slightly wrinkled', cn: '略干、略皱' },
    discard: { en: 'Mold, black spots, leaking', cn: '发霉、发黑、渗水' },
  },
  eggplant: {
    keep: { en: 'Slightly wrinkled, still firm', cn: '表皮稍皱、仍结实' },
    discard: { en: 'Collapsed, dark, leaking', cn: '软塌、发黑、漏汁' },
  },
  bell_pepper: {
    keep: { en: 'Slightly wrinkled, still firm', cn: '轻微起皱、仍结实' },
    discard: { en: 'Soft rot, slimy, moldy', cn: '软烂、发黏、发霉' },
  },
  zucchini: {
    keep: { en: 'Slightly soft, no off smell', cn: '稍微软、无异味' },
    discard: { en: 'Slimy, moldy, collapsed', cn: '发黏、发霉、塌烂' },
  },
  grape: {
    keep: { en: 'A few shriveled grapes, most still firm', cn: '少量干瘪、果粒完整' },
    discard: { en: 'Mold, sticky juice, off smell', cn: '发霉、黏汁、异味' },
  },
  egg: {
    keep: { en: 'Shell intact, smell normal', cn: '蛋壳完整、气味正常' },
    discard: { en: 'Cracked, bad smell, unusual color', cn: '裂壳、臭味、异常变色' },
  },
  beetroot: {
    keep: { en: 'Slightly wrinkled, inside still firm', cn: '表皮略皱、内部硬实' },
    discard: { en: 'Soft rot, black inside, leaking', cn: '软烂、发黑、渗液' },
  },
  avocado: {
    keep: { en: 'Ripe and soft, no off smell', cn: '熟透变软、无异味' },
    discard: { en: 'Large black areas, mold, leaking', cn: '大面积发黑、发霉、漏汁' },
  },
  kiwi: {
    keep: { en: 'Slightly soft, smell normal', cn: '稍软、香味正常' },
    discard: { en: 'Mold, leaking, fermented smell', cn: '发霉、漏汁、酒味' },
  },
  pear: {
    keep: { en: 'Ripe and soft, light bruising', cn: '熟透变软、轻微压痕' },
    discard: { en: 'Large soft areas, mold, fermented smell', cn: '大面积软烂、发霉、酒味' },
  },
  mango: {
    keep: { en: 'Ripe and soft, smell normal', cn: '熟透变软、香味正常' },
    discard: { en: 'Fermented smell, leaking, mold', cn: '发酵味、漏汁、发霉' },
  },
  peach: {
    keep: { en: 'Ripe and slightly soft, light bruising', cn: '熟透稍软、轻微压痕' },
    discard: { en: 'Mold, broken skin, leaking, fermented smell', cn: '发霉、破皮漏汁、酒味' },
  },
  plum: {
    keep: { en: 'Ripe and slightly soft, skin intact', cn: '熟透稍软、表皮完整' },
    discard: { en: 'Mold, leaking, off smell', cn: '发霉、漏汁、异味' },
  },
  cabbage: {
    keep: { en: 'Outer leaves yellow, can be removed', cn: '外叶变黄，可去掉' },
    discard: { en: 'Slimy inside, mold, bad smell', cn: '内部发黏、发霉、臭味' },
  },
  red_cabbage: {
    keep: { en: 'Outer leaves dry, can be removed', cn: '外叶干枯，可去掉' },
    discard: { en: 'Slimy inside, mold, off smell', cn: '内部发黏、发霉、异味' },
  },
  broccoli: {
    keep: { en: 'Slightly dry, lightly yellowing', cn: '略干、轻微发黄' },
    discard: { en: 'Slimy, black rot, bad smell', cn: '发黏、黑烂、臭味' },
  },
  kale: {
    keep: { en: 'Slightly wilted, cook soon', cn: '略蔫，可尽快煮食' },
    discard: { en: 'Slimy, blackened, moldy', cn: '发黏、发黑、发霉' },
  },
  lettuce: {
    keep: { en: 'Slightly wilted, yellow edges', cn: '轻微软塌、边缘发黄' },
    discard: { en: 'Slimy, watery, rotten smell', cn: '发黏、出水、腐烂味' },
  },
  cucumber: {
    keep: { en: 'Slightly soft, skin intact', cn: '轻微软、表皮完整' },
    discard: { en: 'Slimy, watery, moldy', cn: '发黏、渗水、发霉' },
  },
  mushroom: {
    keep: { en: 'Slightly darker, a little dry', cn: '轻微变色、略干' },
    discard: { en: 'Slimy, bad smell, mold', cn: '发黏、异味、发霉' },
  },
  strawberry: {
    keep: { en: 'A few soft berries, eat soon', cn: '少量软果，尽快吃' },
    discard: { en: 'Any mold, leaking juice, slimy', cn: '任何霉点、渗汁、发黏' },
  },
  blueberry: {
    keep: { en: 'Slightly shriveled, overall dry', cn: '少量皱缩、整体干爽' },
    discard: { en: 'Mold, sticky juice, off smell', cn: '发霉、黏汁、异味' },
  },
  milk: {
    keep: { en: 'Smell normal, texture normal', cn: '气味正常、质地正常' },
    discard: { en: 'Sour, lumpy, swollen pack, leaking', cn: '酸味、结块、鼓包、漏液' },
  },
  cheese: {
    keep: { en: 'Hard cheese surface is dry', cn: '硬质奶酪表面变干' },
    discard: { en: 'Slimy, bad smell, obvious mold', cn: '发黏、异味、明显霉变' },
  },
  chicken_breast: {
    keep: { en: 'Kept frozen, color normal', cn: '持续冷冻、颜色正常' },
    discard: { en: 'Sour smell, slimy, repeatedly thawed', cn: '酸臭、发黏、反复解冻' },
  },
  beef: {
    keep: { en: 'Kept frozen, color normal', cn: '持续冷冻、颜色正常' },
    discard: { en: 'Sour smell, slimy, unusual color', cn: '酸臭、发黏、异常变色' },
  },
  pork: {
    keep: { en: 'Kept frozen, no off smell', cn: '持续冷冻、无异味' },
    discard: { en: 'Sour smell, slimy, unusual liquid', cn: '酸臭、发黏、渗液异常' },
  },
  salmon: {
    keep: { en: 'Kept frozen, color normal', cn: '持续冷冻、颜色正常' },
    discard: { en: 'Strong fishy off smell, slimy, gray discoloration', cn: '腥臭异常、发黏、灰暗变色' },
  },
  shrimp: {
    keep: { en: 'Kept frozen, smell normal', cn: '持续冷冻、气味正常' },
    discard: { en: 'Ammonia smell, slimy, severe discoloration', cn: '氨味、发黏、严重变色' },
  },
  cauliflower: {
    keep: { en: 'Frozen normally', cn: '冷冻状态正常' },
    discard: { en: 'Severe freezer burn, sour smell, mushy texture', cn: '严重冰烧、酸臭、黏烂' },
  },
  celery: {
    keep: { en: 'Frozen normally, suitable for cooking', cn: '冷冻正常，可炖煮' },
    discard: { en: 'Severe freezer burn, bad smell, mushy texture', cn: '严重冰烧、臭味、黏烂' },
  },
};
