// Sanctions lists made for the tests in the shape their publishers give them (aml/sanctions.ts): every name invented
// (TEST, Testoslav, Vzorový), padded with numbered subjects to the size a whole list has, so the app's floor of a
// whole list holds. `sanctionsAnswer` plays both publishers, the UN with its redirect to a signed copy; `SANCTIONS_FEED`
// lets a test make one of them fail or give a cut-off file.

export const SANCTIONS_GENERATED = '2026-10-27'
export const SANCTIONS_FEED = { eu: 'ok', un: 'ok', calls: [] }

const pad = (n, make) => Array.from({ length: n }, (_, i) => make(i + 1)).join('\n')

export function euXml({ padding = 1200 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<export xmlns="http://eu.europa.ec/fpi/fsd/export" generationDate="${SANCTIONS_GENERATED}T18:00:00.000+01:00" globalFileId="1">
<sanctionEntity designationDetails="" unitedNationId="" euReferenceNumber="EU.9001.01" logicalId="9001">
  <regulation regulationType="regulation" organisationType="council" publicationDate="2024-01-01" entryIntoForceDate="2024-01-01" numberTitle="TEST 1/2024" programme="TEST" logicalId="1"><publicationUrl>https://example.invalid</publicationUrl></regulation>
  <subjectType code="person" classificationCode="P"/>
  <nameAlias firstName="Testoslav" middleName="" lastName="Sankcionovaný" wholeName="Testoslav Sankcionovaný" function="" gender="M" title="" nameLanguage="" strong="true" regulationLanguage="en" logicalId="11"><regulationSummary regulationType="regulation" publicationDate="2024-01-01" numberTitle="TEST 1/2024"/></nameAlias>
  <nameAlias wholeName="T. Sankcionovany" strong="false" logicalId="12"/>
  <birthdate circa="false" calendarType="GREGORIAN" city="" zipCode="" birthdate="1971-04-02" dayOfMonth="2" monthOfYear="4" year="1971" region="" place="" countryIso2Code="" countryDescription="UNKNOWN" regulationLanguage="en" logicalId="13"/>
</sanctionEntity>
<sanctionEntity designationDetails="" unitedNationId="" euReferenceNumber="EU.9002.02" logicalId="9002">
  <subjectType code="enterprise" classificationCode="E"/>
  <nameAlias wholeName="TEST-ONLY Embargo Trading LLC" logicalId="21"/>
  <nameAlias wholeName="O&apos;Embargo &amp; Partners" logicalId="22"/>
</sanctionEntity>
<sanctionEntity designationDetails="" unitedNationId="" euReferenceNumber="EU.9003.03" logicalId="9003">
  <subjectType code="person" classificationCode="P"/>
  <nameAlias wholeName="Ján Vzorový" logicalId="31"/>
  <birthdate birthdate="1950-01-01" year="1950" logicalId="32"/>
</sanctionEntity>
${pad(padding, (i) => `<sanctionEntity euReferenceNumber="EU.P${i}" logicalId="P${i}"><subjectType code="${i % 3 ? 'person' : 'enterprise'}" classificationCode="P"/><nameAlias wholeName="Padding${i} Entryname${i}" logicalId="P${i}a"/></sanctionEntity>`)}
</export>
`
}

export function unXml({ padding = 400 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<CONSOLIDATED_LIST xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" dateGenerated="${SANCTIONS_GENERATED}T10:00:00.000Z">
<INDIVIDUALS>
<INDIVIDUAL><DATAID>900</DATAID><VERSIONNUM>1</VERSIONNUM><FIRST_NAME>TESTOMIR</FIRST_NAME><SECOND_NAME>UNLISTED</SECOND_NAME><UN_LIST_TYPE>DPRK</UN_LIST_TYPE><REFERENCE_NUMBER>KPi.900</REFERENCE_NUMBER><LISTED_ON>2024-01-01</LISTED_ON><INDIVIDUAL_ALIAS><QUALITY>Good</QUALITY><ALIAS_NAME>Testomir Unlistedov</ALIAS_NAME></INDIVIDUAL_ALIAS><INDIVIDUAL_ALIAS><QUALITY>Low</QUALITY><ALIAS_NAME/></INDIVIDUAL_ALIAS><INDIVIDUAL_DATE_OF_BIRTH><TYPE_OF_DATE>BETWEEN</TYPE_OF_DATE><FROM_YEAR>1960</FROM_YEAR><TO_YEAR>1965</TO_YEAR></INDIVIDUAL_DATE_OF_BIRTH></INDIVIDUAL>
${pad(padding, (i) => `<INDIVIDUAL><DATAID>P${i}</DATAID><FIRST_NAME>PADDING${i}</FIRST_NAME><SECOND_NAME>UNPERSON${i}</SECOND_NAME><REFERENCE_NUMBER>QDi.P${i}</REFERENCE_NUMBER><INDIVIDUAL_DATE_OF_BIRTH><TYPE_OF_DATE>EXACT</TYPE_OF_DATE><DATE>1980-01-01</DATE></INDIVIDUAL_DATE_OF_BIRTH></INDIVIDUAL>`)}
</INDIVIDUALS>
<ENTITIES>
<ENTITY><DATAID>901</DATAID><FIRST_NAME>TEST-ONLY BLOCKADE SHIPPING CO</FIRST_NAME><UN_LIST_TYPE>DPRK</UN_LIST_TYPE><REFERENCE_NUMBER>KPe.900</REFERENCE_NUMBER><ENTITY_ALIAS><QUALITY>a.k.a.</QUALITY><ALIAS_NAME>Blockade Shipping Kft</ALIAS_NAME></ENTITY_ALIAS></ENTITY>
</ENTITIES>
</CONSOLIDATED_LIST>
`
}

/** A stream of a text cut in pieces of a few bytes, to test reading across the pieces. */
export function chunked(text, size = 7) {
  const bytes = new TextEncoder().encode(text)
  let at = 0
  return new ReadableStream({
    pull(controller) {
      if (at >= bytes.length) return controller.close()
      controller.enqueue(bytes.slice(at, at + size))
      at += size
    },
  })
}

const BLOB = 'https://unsolprodfiles.blob.core.windows.net/publiclegacyxmlfiles/EN/consolidatedLegacyByPRN.xml?sig=TEST'

/** Both publishers, as the Worker meets them; null for any other address. */
export function sanctionsAnswer(url) {
  const u = new URL(url)
  if (u.hostname === 'webgate.ec.europa.eu' && u.pathname === '/fsd/fsf/public/files/xmlFullSanctionsList_1_1/content') {
    SANCTIONS_FEED.calls.push('eu')
    if (SANCTIONS_FEED.eu === 'fail') return new Response('TEST-ONLY unavailable', { status: 503 })
    return new Response(euXml({ padding: SANCTIONS_FEED.eu === 'small' ? 5 : 1200 }), { headers: { 'content-type': 'application/xml' } })
  }
  if (u.hostname === 'scsanctions.un.org' && u.pathname === '/resources/xml/en/consolidated.xml') {
    SANCTIONS_FEED.calls.push('un')
    if (SANCTIONS_FEED.un === 'fail') return new Response('TEST-ONLY unavailable', { status: 503 })
    return new Response(null, { status: 302, headers: { location: BLOB } })
  }
  if (u.hostname === 'unsolprodfiles.blob.core.windows.net') return new Response(unXml(), { headers: { 'content-type': 'application/xml' } })
  return null
}
