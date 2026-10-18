/**
 * The sample script. The town, people, events, numbers and sources are invented for this demo and
 * are labelled as such wherever they appear. It is written to trigger rules in all four audits.
 */
import { newWorkspace } from './revisions';
import type { Claim, GlossaryEntry, Workspace } from './types';

export const SAMPLE_TITLE = 'The Only Lighthouse That Walked Inland';

export const SAMPLE_TEXT = `In 1911 the lighthouse at Marrow Bay stood just 9 metres from a cliff that lost almost a metre every winter. {setup:why-move}So why would a small town drag a stone tower half a kilometre inland? It is a shocking story, and it starts with a logbook.

## The keeper's log

The keeper, Siobhán Brannock, wrote down every storm she watched from the lantern room. Her log lists 212 storms in eleven years [c:keeper-log]. The worst storm took 3 metres of cliff in a single night. She was the first keeper to ask the council to move the tower.

The council said no twice. The council said the tower was safe. {setup:keeper-fate}Siobhán kept writing.

## The move

Stone towers are heavy and the ground near the coast was soft and wet for most of the year so the engineers had to plan every metre of the route before anyone touched the tower. Engineers lifted the tower onto timber rails over the winter of 1912, and the crew pulled it inland with horses, winches and ropes for eleven slow weeks while the town watched from the road. The move cost 45 percent of the town's yearly budget [c:move-cost]. Records from that year describe the rails, the horses and the weather in great detail. The rails were oak. The horses came from three farms. The weather was mostly rain. The tower moved about forty metres on a good day and nothing at all on a bad day. The tower lamp was kept lit through the whole move, so ships never lost the light. It was the longest storm season on record [c:storm-record].

## Afterwards

Grass covers the old foundation today.  The tower stands on a low hill behind the church, and its LED lamp still turns every night. {payoff:why-move}The town moved it because Siobhán's log made the danger impossible to ignore.
`;

export const SAMPLE_CLAIMS: Claim[] = [
  {
    id: 'keeper-log',
    statement: 'The keeper recorded 212 storms between 1900 and 1911.',
    sources: [
      {
        citation: 'Sample source: Marrow Bay keeper log, volume 3 (invented for this demo)',
        url: '',
        quote: 'Storms entered in this log since the year 1900: 212.',
      },
    ],
  },
  {
    id: 'worst-storm',
    statement: 'The worst storm of the decade, in 1907, removed 3 metres of the cliff overnight.',
    sources: [
      {
        citation: 'Sample source: Marrow Bay Gazette, 14 March 1907 (invented for this demo)',
        url: '',
        quote: 'The sea took 3 metres of the headland in one night.',
      },
    ],
  },
  {
    id: 'move-cost',
    statement: 'The move cost 40 percent of the 1912 town budget.',
    sources: [
      {
        citation: 'Sample source: council minutes, 2 December 1912 (invented for this demo)',
        url: '',
        quote:
          'The removal of the light shall be paid from the general fund, being 40 percent of this year.',
      },
    ],
  },
  {
    id: 'storm-record',
    statement: 'The 1912 storm season was the longest recorded at Marrow Bay.',
    sources: [],
  },
];

export const SAMPLE_GLOSSARY: GlossaryEntry[] = [{ term: 'Brannock', say: 'BRAN-ock' }];

export function sampleWorkspace(at: string): Workspace {
  const ws = newWorkspace(SAMPLE_TITLE, SAMPLE_TEXT, at, true);
  return { ...ws, claims: SAMPLE_CLAIMS, glossary: SAMPLE_GLOSSARY };
}
