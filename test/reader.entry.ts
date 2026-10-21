// What `npm run test:reader` needs of the app: the reader itself and the comparison the page "Presnosť AI" uses.
export { readDocument, sniff } from '../src/app/read'
export { compareFields, READ_FIELDS } from '../src/team/ai-accuracy'
export { READER } from '../src/config'
export { CATEGORY_IDS } from '../src/app/booking'
