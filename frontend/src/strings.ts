/**
 * Every text the site shows or reads out, in one place: by component, with what three or more share in `common`.
 * Text with values in it is a function of them.
 */
export const strings = {
  common: {
    loading: 'Loading…',
    whatsNew: "What's new?",
    apps: 'Apps',
    aboutMe: 'About Me',
    sessionHasEndedSign: 'Your session has ended. Sign in again, then save.',
    couldntSavePleaseTry: "Couldn't save. Please try again.",
    cancel: 'Cancel',
    didntWorkPleaseTry: "That didn't work. Please try again.",
    delete: 'Delete',
    visits: 'Visits',
    errors: 'Errors',
    title: 'Title',
    bulletPoint: 'bullet point',
    termsConditions: 'Terms and Conditions',
    email: 'Email',
    status: 'Status',
    sending: 'Sending…',
    from: 'From',
    message: 'Message',
    couldntSavedPleaseTry: "That couldn't be saved. Please try again.",
    save: 'Save',
    saved: 'Saved.',
    remove: 'Remove',
    saving: 'Saving…',
    edit: 'Edit ',
    skills: 'Skills',
    workExperience: 'Work experience',
    education: 'Education',
    academicPapers: 'Academic papers',
    qualifications: 'Qualifications',
    languages: 'Languages',
    licences: 'Licences',
    hackathons: 'Hackathons',
    close: 'Close',
    edit2: 'Edit',
    name: 'Name',
    citizenshipResidence: 'Citizenship and residence',
    getUpdates: 'Get updates',
    nothingHereYet: 'Nothing here yet.',
  },
  // components/ConfirmDialog/ConfirmDialog.tsx
  confirmDialog: {
    working: 'Working…',
  },
  // components/CopyButton/CopyButton.tsx
  copyButton: {
    copied: 'Copied!',
    couldntCopy: "Couldn't copy",
    copyClipboard: (label: string) => `Copy ${label} to clipboard`,
    copied2: (label: string) => `${label} copied`,
    couldntCopy2: (label: string) => `Couldn't copy ${label}`,
    copy: (label: string) => `Copy ${label}`,
  },
  // components/DeleteButton/DeleteButton.tsx
  deleteButton: {
    cantUndone: "This can't be undone.",
  },
  // components/DiscardChangesDialog/DiscardChangesDialog.tsx
  discardChangesDialog: {
    discardChanges: 'Discard your changes?',
    discard: 'Discard',
  },
  // components/EmptyState/EmptyState.tsx
  emptyState: {
    nothingHereYet: 'Nothing here yet',
  },
  // components/ErrorState/ErrorState.tsx
  errorState: {
    tryAgain: 'Try again',
  },
  // components/fields/editor.ts
  editor: {
    goesWhenSaveSection: 'It goes when you save this section; Cancel brings it back.',
  },
  // components/fields/ItemControls/ItemControls.tsx
  itemControls: {
    moveUp: (name: string) => `Move ${name} up`,
    moveUp2: 'Move up',
    moveDown: (name: string) => `Move ${name} down`,
    moveDown2: 'Move down',
  },
  // components/fields/LinkInserter/LinkInserter.tsx
  linkInserter: {
    enterFullLinkHttps: 'Enter a full link (https://…) or a path on this site (/…).',
    addLink: 'Add link ',
    to: 'to ',
    addLink2: (fieldLabel: string) => `Add a link to ${fieldLabel}`,
    linkText: 'Link text',
    universityManchester: 'The University of Manchester',
    linkUrl: 'Link URL',
    insertLink: 'Insert link',
  },
  // components/fields/MonthField/MonthField.tsx
  monthField: {
    month: (label: string) => `${label} month`,
    year: (label: string) => `${label} year`,
  },
  // components/MediaCard.tsx
  mediaCard: {
    opensNewTab: '(opens in a new tab)',
  },
  // components/Modal/Modal.tsx
  modal: {
    modal: (className: string) => `modal ${className}`,
  },
  // components/OnOffSwitch/OnOffSwitch.tsx
  onOffSwitch: {
    on: 'On',
    off: 'Off',
  },
  // components/Pagination.tsx
  pagination: {
    pagination: 'Pagination',
    previous: 'Previous',
    page: 'Page ',
    of: 'of ',
    next: 'Next',
  },
  // components/useDragSort.ts
  useDragSort: {
    reorder: (name: string) => `Reorder ${name}`,
    dragReorderUseArrow: 'Drag to reorder, or use the arrow keys',
    movedPosition: (value: number, count: number) => `Moved to position ${value} of ${count}.`,
  },
  // components/ViceMark.tsx
  viceMark: {
    vice: 'Vice',
  },
  // features/about/FileUpload/FileUpload.tsx
  fileUpload: {
    uploading: (percent: number) => `Uploading… ${percent}%`,
    replace: (noun: string) => `Replace ${noun}`,
    upload: (noun: string) => `Upload ${noun}`,
    fileLimit: (size: string, maxBytes: string) => `That file is ${size}. The limit is ${maxBytes}.`,
    sessionHasEndedSign: 'Your session has ended. Sign in again, then upload.',
    couldntUploadPleaseTry: "Couldn't upload. Please try again.",
    file: (label: string, text: string) => `${label} file${text}`,
    the: (noun: string, context: string) => `the ${noun} ${context}`,
    the2: (noun: string) => `the ${noun}`,
    remove2: (noun: string) => `Remove ${noun}`,
    remove3: 'Remove ',
  },
  // features/about/format.ts
  aboutFormat: {
    starting: (start: string) => `Starting ${start}`,
    present: (start: string) => `${start} – Present`,
    mb: (text: string | number | null | undefined) => `${text} MB`,
  },
  // features/about/hackathons/HackathonEditor/HackathonEditor.tsx
  hackathonEditor: {
    hackathon: 'Hackathon ',
    year: 'Year',
    whatHappened: 'What happened',
  },
  // features/about/hackathons/HackathonsEditor/HackathonsEditor.tsx
  hackathonsEditor: {
    sortYear: 'Sort by year',
    sortedYearNewestFirst: 'Sorted by year, newest first. Save to keep this order, or Cancel to undo.',
    addHackathon: 'Add hackathon',
  },
  // features/about/languages/LanguageEditor/LanguageEditor.tsx
  languageEditor: {
    language: 'Language ',
    language2: 'Language',
    level: 'Level',
  },
  // features/about/languages/LanguagesEditor/LanguagesEditor.tsx
  languagesEditor: {
    addLanguage: 'Add language',
  },
  // features/about/legend.ts
  legend: {
    work: 'Work',
    academic: 'Academic',
    personal: 'Personal',
    native: 'Native',
    fluent: 'Fluent',
    advanced: 'Advanced',
    intermediate: 'Intermediate',
    beginner: 'Beginner',
    worked: 'Worked',
    studied: 'Studied',
    visited: 'Visited',
  },
  // features/about/licences/LicenceGroup/LicenceGroup.tsx
  licenceGroup: {
    licences: (label: string) => `${label} licences`,
  },
  // features/about/licences/licences.ts
  licences: {
    driving: 'Driving',
    flying: 'Flying',
    boating: 'Boating',
    other: 'Other',
    moped: 'Moped',
    lightMotorcycle: 'Light motorcycle',
    mediumMotorcycle: 'Medium motorcycle',
    motorcycle: 'Motorcycle',
    car: 'Car',
    carTrailer: 'Car with trailer',
    mediumTruck: 'Medium truck',
    truck: 'Truck',
    truckTrailer: 'Truck with trailer',
    minibus: 'Minibus',
    bus: 'Bus',
    droneOpenCategory: 'Drone (open category)',
    a2Cofc: 'A2 CofC',
    droneA2Certificate: 'Drone (A2 certificate)',
    gliderPilot: 'Glider pilot',
    lightAircraftPilot: 'Light aircraft pilot',
    privatePilotAeroplanes: 'Private pilot, aeroplanes',
    privatePilotHelicopters: 'Private pilot, helicopters',
    commercialPilot: 'Commercial pilot',
    airlineTransportPilot: 'Airline transport pilot',
    internationalCertificateCompetence: 'International Certificate of Competence',
    powerboatLevel2: 'Powerboat Level 2',
    personalWatercraftJetSki: 'Personal watercraft (jet ski)',
    vhfRadioOperator: 'VHF radio operator',
    daySkipper: 'Day Skipper',
    coastalSkipper: 'Coastal Skipper',
    yachtmaster: 'Yachtmaster',
  },
  // features/about/licences/LicencesEditor/LicencesEditor.tsx
  licencesEditor: {
    others: 'Others',
  },
  // features/about/licences/OwnLicenceForm/OwnLicenceForm.tsx
  ownLicenceForm: {
    enterWhatLicence: 'Enter what the licence is for.',
    kind: 'Kind',
    codeOptional: 'Code (optional)',
    for: 'For',
    eGTractor: 'e.g. Tractor',
    addLicence: 'Add licence',
  },
  // features/about/papers/PaperEditor/PaperEditor.tsx
  paperEditor: {
    paper: 'Paper ',
    pdf: 'PDF',
    paper2: (value: number) => `for paper ${value}`,
    up200MbPdf: 'Up to 200 MB. With a PDF, the title becomes its download link.',
    noPdfTitleShown: 'No PDF: the title is shown without a link.',
  },
  // features/about/papers/PapersEditor/PapersEditor.tsx
  papersEditor: {
    addPaper: 'Add paper',
  },
  // features/about/papers/PapersSection/PapersSection.tsx
  papersSection: {
    pdf: (title: string) => `${title} (PDF)`,
  },
  // features/about/places/CityResults/CityResults.tsx
  cityResults: {
    noPlacesFound: 'No places found.',
    matchingPlaces: 'Matching places',
  },
  // features/about/places/CitySearch/CitySearch.tsx
  citySearch: {
    addCity: 'Add a city',
    manchesterManchesterEngland: 'Manchester, or Manchester, England',
    anyPlace1000: 'Any place with 1,000+ people. City data:',
    geonames: 'GeoNames',
    searching: 'Searching…',
    searchIsntWorkingRight: "The search isn't working right now. Please try again.",
  },
  // features/about/places/PlacePopup/PlacePopup.tsx
  placePopup: {
    bscComputerScience: 'BSc Computer Science at …',
    softwareEngineer: 'Software Engineer at …',
    holiday2023: 'Holiday, 2023',
    tickLeastOneWorked: 'Tick at least one: worked, studied or visited.',
    noteOptional: (kind: string) => `${kind}: note (optional)`,
    addMap: 'Add to map',
    updatePlace: 'Update place',
    map: (name: string) => `${name} from the map`,
    removeMap: 'Remove from map',
    changesShowPageOnce: 'Changes show on the page once you save this section.',
  },
  // features/about/places/PlacesList/PlacesList.tsx
  placesList: {
    placesMap: 'Places on the map',
    edit: (name: string) => `Edit ${name}`,
  },
  // features/about/places/PlacesSection/PlacesSection.tsx
  placesSection: {
    whereIveBeen: "Where I've been",
    pinchCtrlScrollZoom: 'Pinch or Ctrl + scroll to zoom',
    noPlacesYet: 'No places yet.',
  },
  // features/about/places/WorldMap/WorldMap.tsx
  worldMap: {
    worldMap: 'World map',
    edit: (placeLabel: string) => `Edit ${placeLabel}`,
  },
  // features/about/places/ZoomControls/ZoomControls.tsx
  zoomControls: {
    zoom: 'Zoom in',
    zoomOut: 'Zoom out',
    showWholeWorld: 'Show the whole world',
  },
  // features/about/problemSolving/DifficultyBreakdown/DifficultyBreakdown.tsx
  difficultyBreakdown: {
    solvedDifficulty: 'Solved by difficulty',
  },
  // features/about/problemSolving/LeetCodeCard/LeetCodeCard.tsx
  leetCodeCard: {
    leetcodeHasNoUser: 'LeetCode has no user called ',
    checkUsernameEdit: '. Check the username with Edit.',
    leetcodeStatsCantLoaded: "LeetCode stats can't be loaded right now.",
    asOf: 'As of ',
  },
  // features/about/problemSolving/LeetCodeProfileLink/LeetCodeProfileLink.tsx
  leetCodeProfileLink: {
    leetcode: 'LeetCode',
  },
  // features/about/problemSolving/LeetCodeSkeleton/LeetCodeSkeleton.tsx
  leetCodeSkeleton: {
    loadingLeetcodeStats: 'Loading LeetCode stats…',
  },
  // features/about/problemSolving/NeetCodeLists/NeetCodeLists.tsx
  neetCodeLists: {
    neetcodeListsCompleted: 'NeetCode lists completed',
  },
  // features/about/problemSolving/problemSolving.ts
  problemSolving: {
    blind75: 'Blind 75',
    neetcode150: 'NeetCode 150',
    neetcode250: 'NeetCode 250',
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
  },
  // features/about/problemSolving/ProblemSolvingEditor/ProblemSolvingEditor.tsx
  problemSolvingEditor: {
    leetcodeUsername: 'LeetCode username',
    leetcodeComUUsername: 'As in leetcode.com/u/username (pasting the profile link works too). Leave empty to hide the stats.',
    eGNeetcode: 'e.g. neetcode',
    neetcodeListsCompleted: 'NeetCode lists completed',
    clickOnesYouveCompleted: "Click the ones you've completed.",
  },
  // features/about/problemSolving/ProblemSolvingSection/ProblemSolvingSection.tsx
  problemSolvingSection: {
    problemSolving: 'Problem solving',
  },
  // features/about/problemSolving/SolvedRing/SolvedRing.tsx
  solvedRing: {
    solved: 'solved',
  },
  // features/about/profile/PrivateContact/PrivateContact.tsx
  privateContact: {
    onlySee: 'Only you see this:',
  },
  // features/about/profile/ProfileEditor/ProfileEditor.tsx
  profileEditor: {
    photo: 'Photo',
    jpegPngWebpGif: "JPEG, PNG, WebP or GIF, up to 15 MB. It's resized, and its location data is removed.",
    rSum: 'For the résumé',
    headline: 'Headline',
    fullStackEngineerNet: 'Full-stack engineer · .NET, React, PostgreSQL',
    phone: 'Phone',
    githubUrl: 'GitHub URL',
    leaveEmptyHide: 'Leave empty to hide it.',
    linkedinUrl: 'LinkedIn URL',
    instagramUrl: 'Instagram URL',
  },
  // features/about/profile/ProfileLinks/ProfileLinks.tsx
  profileLinks: {
    links: 'Links',
  },
  // features/about/profile/ProfilePhoto/ProfilePhoto.tsx
  profilePhoto: {
    claudiuJechel: 'Claudiu Jechel',
    photoPlaceholder: 'Photo placeholder',
  },
  // features/about/profile/ProfileSection/ProfileSection.tsx
  profileSection: {
    downloadRSum: 'Download résumé',
    instagram: 'Instagram',
    email: 'email',
    phoneNumber: 'phone number',
    photoLinks: 'Photo and links',
    claudiuMihaiJechel: 'Claudiu Mihai Jechel',
    noEmailPhoneR: 'no email or phone for the résumé yet. Use Edit to add them.',
    rSumSPhone: "Your résumé's phone, email and headline couldn't be loaded.",
  },
  // features/about/profile/StatusChips/StatusChips.tsx
  statusChips: {
    noCitizenshipResidenceLabels: 'No citizenship or residence labels yet. Use Edit to add them.',
  },
  // features/about/profile/StatusEditor/StatusEditor.tsx
  statusEditor: {
    label: (value: number) => `Label ${value}`,
    flag: 'Flag',
    noFlag: 'No flag',
    label2: 'Label',
  },
  // features/about/profile/StatusesEditor/StatusesEditor.tsx
  statusesEditor: {
    addLabel: 'Add label',
  },
  // features/about/qualifications/QualificationEditor/QualificationEditor.tsx
  qualificationEditor: {
    qualification: 'Qualification ',
    qualification2: 'Qualification',
    issuedOptional: 'Issued by (optional)',
    obtained: 'Obtained',
    gradeOptional: 'Grade (optional)',
    eGFirstClass: 'e.g. First Class, 870/1000',
  },
  // features/about/qualifications/QualificationsEditor/QualificationsEditor.tsx
  qualificationsEditor: {
    addQualification: 'Add qualification',
  },
  // features/about/qualifications/QualificationsSection/QualificationsSection.tsx
  qualificationsSection: {
    grade: (grade: string) => `Grade: ${grade}`,
  },
  // features/about/section/BulletsEditor/BulletsEditor.tsx
  bulletsEditor: {
    add: 'Add ',
  },
  // features/about/section/ColorLegend/ColorLegend.tsx
  colorLegend: {
    colours: 'Colours',
  },
  // features/about/section/ColorsFieldset/ColorsFieldset.tsx
  colorsFieldset: {
    colours: 'Colours',
  },
  // features/about/section/EditableSection/EditableSection.tsx
  editableSection: {
    edit: (name: string) => `Edit ${name}`,
  },
  // features/about/section/saveError.ts
  saveError: {
    photoLinks: 'Photo and links',
    whereIveBeen: "Where I've been",
    problemSolving: 'Problem solving',
    item: (title: string, value: number) => `${title}, item ${value}`,
    couldntSaveBecauseAnother: (join: string, more: string) => `Couldn't save, because another section needs fixing first. ${join}${more}`,
    someFieldsNeedFixing: 'Some fields need fixing; see the messages above.',
  },
  // features/about/section/SectionHeader/SectionHeader.tsx
  sectionHeader: {
    collapse: 'Collapse',
    expand: 'Expand',
  },
  // features/about/skills/PeriodEditor/PeriodEditor.tsx
  periodEditor: {
    to: 'To',
    stillUsing: 'Still using it',
    used: 'Used for',
  },
  // features/about/skills/SkillEditor/SkillEditor.tsx
  skillEditor: {
    skill: 'Skill ',
    skill2: (value: number) => `Skill ${value}`,
    noDates: 'no dates',
    skill3: 'Skill',
    noDatesYetAdd: 'No dates yet. Add when you used it to show it on the timeline.',
    period: (value: number) => `Period ${value}`,
    periods: (n: number) => `${n} ${n === 1 ? 'period' : 'periods'}`,
    addPeriod: 'Add period ',
    skill4: 'to skill ',
  },
  // features/about/skills/skills.ts
  skills: {
    n1Month: '1 month',
    months: (months: number) => `${months} months`,
    n1Year: '1 year',
    years: (years: number) => `${years} years`,
  },
  // features/about/skills/SkillsChart/SkillsChart.tsx
  skillsChart: {
    skillsWhenHowEach: 'Skills, with when and how each was used',
  },
  // features/about/skills/SkillsEditor/SkillsEditor.tsx
  skillsEditor: {
    sortExperience: 'Sort by experience',
    sortedExperienceMostFirst: 'Sorted by experience, most first. Save to keep this order, or Cancel to undo.',
    addSkill: 'Add skill',
  },
  // features/about/skills/SkillsSection/SkillsSection.tsx
  skillsSection: {
    noSkillsYet: 'No skills yet.',
  },
  // features/about/timeline/timeline.ts
  timeline: {
    jobTitle: 'Job title',
    company: 'Company',
    degreeCourse: 'Degree or course',
    institution: 'Institution',
  },
  // features/about/timeline/TimelineEditor/TimelineEditor.tsx
  timelineEditor: {
    sortEndDate: 'Sort by end date',
    sortedEndDateOngoing: 'Sorted by end date, ongoing first. Save to keep this order, or Cancel to undo.',
    add: 'Add ',
  },
  // features/about/timeline/TimelineEntryEditor/TimelineEntryEditor.tsx
  timelineEntryEditor: {
    locationOptional: 'Location (optional)',
    start: 'Start',
    end: 'End',
    ongoingNoEndDate: 'Ongoing (no end date)',
    whatDid: 'What you did',
  },
  // features/about/timeline/TimelineItem/TimelineItem.tsx
  timelineItem: {
    upcoming: 'Upcoming',
  },
  // features/admin/GoogleSignInButton/GoogleSignInButton.tsx
  googleSignInButton: {
    signGoogle: 'Sign in with Google',
  },
  // features/analytics/format.ts
  analyticsFormat: {
    minutesSeconds: (minutes: number, seconds: string) => `${minutes}m ${seconds}s`,
    hoursMinutes: (hours: number, minutes: string) => `${hours}h ${minutes}m`,
    n5Minutes: '5 minutes',
    dayAndHours: (day: string, hours: string) => `${day}, ${hours}`,
    opened: (path: string) => `Opened ${path}`,
    clicked: (label: string, href?: string, checked?: string) =>
      `Clicked “${label}”${href ? ` (${href})` : ''}${checked ? ` → ${checked === 'true' ? 'ticked' : 'unticked'}` : ''}`,
    changed: (label: string, value?: string, files?: string) => `Changed “${label}”${value ? ` → ${value}` : files ? ` → ${files} ${files === '1' ? 'file' : 'files'}` : ''}`,
    pressed: (label: string | number | null | undefined) => `Pressed ${label}`,
    sentForm: (label: string, pressedEnter: boolean) => `Sent the form “${label}”${pressedEnter ? ' (pressed Enter)' : ''}`,
    scrolledDownPage: (label: string | number | null | undefined) => `Scrolled ${label} down the page`,
    cameBackTab: 'Came back to the tab',
    switchedAwayHidTab: 'Switched away (hid the tab)',
    error: (value: string) => `ERROR: ${value}`,
    unknownError: 'Unknown error',
    leftSiteClosedTab: 'Left the site (closed the tab or went elsewhere)',
    visit: (id: string, startedAt: string) => `Visit ${id}, ${startedAt}`,
    setup: 'Setup',
    device: (visit: string) => `- Device: ${visit}`,
    viewportScreen: (viewportWidth: number, viewportHeight: number, screenWidth: number, screenHeight: number) =>
      `- Viewport: ${viewportWidth}×${viewportHeight} (screen ${screenWidth}×${screenHeight})`,
    theme: (visit: string) => `- Theme: ${visit}`,
    languageTimeZone: (value: string, value2: string) => `- Language: ${value}, time zone: ${value2}`,
    userAgent: (userAgent: string) => `- User agent: ${userAgent}`,
    steps: 'Steps',
  },
  // features/analytics/RankedList.tsx
  rankedList: {
    nothingYet: 'Nothing yet.',
  },
  // features/analytics/SeriesChart/SeriesChart.tsx
  seriesChart: {
    visitors: 'Visitors',
    pageViews: 'Page views',
    pageView: 'page view',
    pageViews2: 'page views',
    per: (label: string, per: string) => `${label} per ${per}`,
    perTotal: (label: string, per: string, total: number) => `${label} per ${per}: ${total} in total`,
    measure: 'Measure',
  },
  // features/analytics/StatTiles.tsx
  statTiles: {
    visitors: 'Visitors',
    uniquePerDay: 'Unique per day',
    tabOpeningClosing: 'A tab, from opening to closing',
    pageViews: 'Page views',
    perVisit: (toFixed: string) => `${toFixed} per visit`,
    averageVisit: 'Average visit',
    firstLastAction: 'First to last action',
    bounceRate: 'Bounce rate',
    onePageThenGone: 'One page, then gone',
    seeVisitsBelow: 'See the visits below',
    none: 'None',
  },
  // features/analytics/VisitDialog/VisitDialog.tsx
  visitDialog: {
    visit: (startedAt: string) => `Visit on ${startedAt}`,
    visit2: 'Visit',
    loadingVisit: 'Loading the visit…',
    visitCouldntLoaded: "This visit couldn't be loaded.",
    direct: 'Direct',
    device: 'Device',
    window: 'Window',
    theme: 'Theme',
    length: 'Length',
    came: 'Came from',
    where: 'Where',
    stepsReproduce: 'steps to reproduce',
    copyStepsReproduce: 'Copy steps to reproduce',
    visit3: 'this visit',
    deleteVisit: 'Delete visit',
    whatHappened: 'What happened',
    details: 'Details',
  },
  // features/analytics/VisitsTable/VisitsTable.tsx
  visitsTable: {
    onlyVisitsErrors: 'Only visits with errors',
    loadingVisits: 'Loading visits…',
    visitsCouldntLoaded: "Visits couldn't be loaded.",
    noVisitHasHit: 'No visit has hit an error.',
    noVisitsYet: 'No visits yet.',
    visitsTable: 'Visits table',
    started: 'Started',
    length: 'Length',
    pages: 'Pages',
    device: 'Device',
    entryPage: 'Entry page',
    direct: 'Direct',
  },
  // features/apps/AddAppTile/AddAppTile.tsx
  addAppTile: {
    addApp: 'Add an app',
  },
  // features/apps/AppDialog/AppDialog.tsx
  appDialog: {
    someFieldsNeedFixing: 'Some fields need fixing.',
    edit: (title: string) => `Edit ${title}`,
    addApp: 'Add an app',
    addApp2: 'Add app',
    whatChangedAppIsnt: "What you changed in this app isn't saved.",
  },
  // features/apps/AppForm/AppForm.tsx
  appForm: {
    showWhatsNew: "Show in What's new?",
    description: 'Description',
    removedAppsPageImages: "It's removed from the Apps page, with its images and videos. This can't be undone.",
    deleteApp: 'Delete app',
  },
  // features/apps/appOptions.ts
  appOptions: {
    android: 'Android',
    web: 'Web',
    windows: 'Windows',
    linux: 'Linux',
    xbox: 'Xbox',
    nintendoSwitch: 'Nintendo Switch',
    steamDeck: 'Steam Deck',
    appStore: 'App Store',
    googlePlay: 'Google Play',
    steam: 'Steam',
    playstationStore: 'PlayStation Store',
    microsoftStore: 'Microsoft Store',
    xboxStore: 'Xbox Store',
    nintendoEshop: 'Nintendo eShop',
    epicGamesStore: 'Epic Games Store',
    macAppStore: 'Mac App Store',
    web2: 'the web',
  },
  // features/apps/CarouselControls/CarouselControls.tsx
  carouselControls: {
    previous: 'Previous',
    next: 'Next',
  },
  // features/apps/CategoriesButton/CategoriesButton.tsx
  categoriesButton: {
    categories: 'Categories',
  },
  // features/apps/CategoriesDialog/CategoriesDialog.tsx
  categoriesDialog: {
    someNamesNeedFixing: 'Some names need fixing.',
    category: (value: number) => `Category ${value}`,
    category2: (value: number) => `category ${value}`,
    appCategories: 'App categories',
    appsShowTheirCategories: 'Apps show their categories as labels, in this order. Removing one takes it off every app.',
    addCategory: 'Add category',
    changesCategoriesArentSaved: "Your changes to the categories aren't saved.",
  },
  // features/apps/CategoryPicker/CategoryPicker.tsx
  categoryPicker: {
    kindApp: 'Kind of app',
    noCategoriesYetAdd: 'No categories yet: add them with Categories, above the apps.',
  },
  // features/apps/LinksEditor/LinksEditor.tsx
  linksEditor: {
    checkLink: (value: number) => `Check it on… (link ${value})`,
    addressLink: (value: number) => `Address (link ${value})`,
    link: (value: number) => `link ${value}`,
    check: 'Check it on…',
    appStore: 'App Store',
    https: 'https://…',
    goesWhenSaveApp: 'It goes when you save the app; Cancel keeps it.',
    addLink: 'Add a link',
  },
  // features/apps/media.ts
  media: {
    pasteLinkFirst: 'Paste a link first.',
    shouldLinkStartingHttps: 'That should be a link starting with https://.',
  },
  // features/apps/MediaCarousel/MediaCarousel.tsx
  mediaCarousel: {
    of: (value: number, length: number) => `${value} of ${length}`,
    slideLabel: (title: string, isImage: boolean, n: number, count: number) => `${title}, ${isImage ? 'image' : 'video'} ${n} of ${count}`,
    carousel: 'carousel',
    imagesVideos: (title: string) => `${title}: images and videos`,
    useArrowKeysMove: 'Use the arrow keys to move between slides',
    slide: 'slide',
    show: (value: number, length: number) => `Show ${value} of ${length}`,
  },
  // features/apps/MediaListEditor/MediaListEditor.tsx
  mediaListEditor: {
    youtubeVideo: 'YouTube video',
    image: 'Image',
    video: 'Video',
    limit: (name: string, size: string, max: string) => `${name} is ${size}; the limit is ${max}.`,
    uploading: (value: number, length: number) => `Uploading ${value} of ${length}…`,
    uploading2: 'Uploading…',
    sessionHasEndedSign: 'your session has ended. Sign in again, then upload.',
    couldntUploadPleaseTry: "couldn't upload. Please try again.",
    imagesVideos: 'Images and videos',
    firstImageTilesPicture:
      "The first image is the tile's picture. Drag to reorder. Upload JPEG, PNG, WebP or GIF up to 15 MB and MP4, MOV or WebM up to 200 MB, or add a link: a YouTube video, or an image or video elsewhere.",
    goesWhenSaveApp: 'It goes when you save the app; Cancel keeps it.',
    imageVideoFiles: 'Image or video files',
    uploadImagesVideos: 'Upload images or videos',
    addLink: 'Or add from a link',
    httpsWwwYoutubeCom: 'https://www.youtube.com/watch?v=…',
    addLink2: 'Add link',
  },
  // features/apps/MediaSlide/MediaSlide.tsx
  mediaSlide: {
    show: (label: string) => `Show ${label}`,
  },
  // features/apps/OrganiseButton/OrganiseButton.tsx
  organiseButton: {
    organise: 'Organise',
  },
  // features/apps/OrganiseDialog/OrganiseDialog.tsx
  organiseDialog: {
    appsWereAddedDeleted: "Apps were added or deleted meanwhile. Here's the list as it is now: arrange it again, then save.",
    organiseApps: 'Organise apps',
    appsPageShowsThem: "The Apps page shows them in this order. What's new? shows the first one that's on.",
    loadingApps: 'Loading the apps…',
    appsCantLoadedRight: "The apps can't be loaded right now.",
    noAppsYet: 'No apps yet.',
    whatsNew: "In What's new?",
    appsOrder: 'Apps, in order',
    showWhatsNew: (title: string) => `Show ${title} in What's new?`,
    newOrderAppsIsnt: "Your new order of the apps isn't saved.",
  },
  // features/apps/PlatformChips/PlatformChips.tsx
  platformChips: {
    runs: 'Runs on',
  },
  // features/apps/PlatformsEditor/PlatformsEditor.tsx
  platformsEditor: {
    runs: 'Runs on',
    anotherPlatform: 'Another platform',
    eGMetaQuest: 'e.g. Meta Quest',
    addPlatform: 'Add platform',
  },
  // features/apps/StoreLinks/StoreLinks.tsx
  storeLinks: {
    check: (label: string) => `Check it on ${label}`,
    whereGet: 'Where to get it',
  },
  // features/auth/SignedInDevices/SignedInDevices.tsx
  signedInDevices: {
    signedOut: (device: string) => `Signed out ${device}.`,
    deviceCouldntSignedOut: "That device couldn't be signed out. Please try again.",
    noOtherDeviceWas: 'No other device was signed in.',
    signedOutOther: (count: number, text: string) => `Signed out ${count} other ${text}.`,
    otherDevicesCouldntSigned: "The other devices couldn't be signed out. Please try again.",
    unknownAddress: 'Unknown address',
    loadingSignedDevices: 'Loading the signed-in devices…',
    signedDevicesCouldntLoaded: "The signed-in devices couldn't be loaded.",
    signedDevices: 'Signed-in devices',
    device: 'This device',
    signed: '· signed in ',
    active: '· active ',
    ends: '· ends by ',
    signOut: (name: string) => `Sign out ${name}`,
    signingOut: 'Signing out…',
    signOut2: 'Sign out',
    signOutAllOther: 'Sign out all other devices',
  },
  // features/contact/ContactForm/ContactForm.tsx
  contactForm: {
    contactMe: 'Contact me',
    haveQuestionIdeaSend: "Have a question or an idea? Send me a message and I'll reply by email. All fields are required.",
    thank: 'Thank you!',
    messageWasSentIll: "Your message was sent. I'll get back to you at ",
    sendAnotherMessage: 'Send another message',
    whatsAbout: "What's it about?",
    questionAnythingElse: 'A question, or anything else',
    projectWorkingMe: 'A project: working with me',
    between: 'Between ',
    and: 'and ',
    characters: 'characters.',
    messageCouldntSentPlease: "Your message couldn't be sent. Please try again in a moment.",
    severalMessagesShortWhile: 'Several messages in a short while: please try again in a few minutes.',
    sendMessage: 'Send message',
    fillEveryFieldSend: 'Fill in every field to send it.',
  },
  // features/contact/contactRules.ts
  contactRules: {
    projectEnquiry: 'Project enquiry',
    pleaseEnterName: 'Please enter your name.',
    nameCanMostCharacters: (nameMaxLength: number) => `Your name can be at most ${nameMaxLength} characters.`,
    pleaseEnterEmail: 'Please enter your email.',
    pleaseEnterValidEmail: 'Please enter a valid email address, like name@example.com.',
    pleaseWriteMessage: 'Please write a message.',
    messageNeedsLeastCharacters: (messageMinLength: number, value: number) => `Your message needs at least ${messageMinLength} characters (${value} more).`,
    messageCanMostCharacters: (messageMaxLength: number) => `Your message can be at most ${messageMaxLength} characters.`,
  },
  // features/contact/MessageDialog/MessageDialog.tsx
  messageDialog: {
    message: 'Message from ',
    loadingMessage: 'Loading the message…',
    messageCouldntLoaded: "This message couldn't be loaded.",
    received: 'Received',
    subject: 'Subject',
    meetingsTheyBooked: 'Meetings they booked',
    message3: (name: string) => `the message from ${name}`,
    deleteMessage: 'Delete message',
    writeReplyFirst: 'Write the reply first.',
    emailCouldntSentCheck: "The email couldn't be sent: check Resend in Settings (its test shows why).",
    conversation: 'Conversation',
    reply: 'Reply',
    you: 'You',
    writeAgain: (name: string) => `Write to ${name} again`,
    reply2: (name: string) => `Reply to ${name}`,
    emailedThemTheirAnswer: 'Emailed to them: their answer lands here.',
    sendReply: 'Send reply',
    addBookingLink: 'Add booking link',
  },
  // features/contact/MessagesInbox/MessagesInbox.tsx
  messagesInbox: {
    messages: 'Messages',
    count: (n: number) => `${n} ${n === 1 ? 'message' : 'messages'}`,
    loadingMessages: 'Loading messages…',
    messagesCouldntLoaded: "Messages couldn't be loaded.",
    noMessagesYet: 'No messages yet.',
    messagesTable: 'Messages table',
    lastMessage: 'Last message',
    actions: 'Actions',
    unread: 'Unread',
    projectEnquiry: 'Project enquiry',
    messages2: 'messages',
    message: (name: string) => `the message from ${name}`,
  },
  // features/featureTesting/testFeatures.ts
  testFeatures: {
    workMe: 'Work with me',
  },
  // features/meetings/format.ts
  meetingsFormat: {
    waiting: 'Waiting for you',
    accepted: 'Accepted',
    declined: 'Declined',
    cancelled: 'Cancelled',
  },
  // features/meetings/MeetingActions/MeetingActions.tsx
  meetingActions: {
    calComDidntTake: "Cal.com didn't take it. Check the API key in Settings, then try again.",
    messageCouldntEmailedCal: "Your message couldn't be emailed; Cal.com still told them.",
    messageWasEmailedThem: 'Your message was emailed to them.',
    hasEndedAlreadyThere: 'It has ended already: there is nothing to cancel.',
    calComEmailedThem: 'Cal.com emailed them.',
    cancelMeeting: 'Cancel meeting',
    cancelMeeting2: (attendee: string) => `Cancel the meeting with ${attendee}?`,
    keep: 'Keep it',
    calComEmails: '. Cal.com emails ',
    cancelledFreesTimeCalendar: "that it's cancelled, and frees the time in your calendar.",
    reasonOptional: 'Reason (optional)',
    calComsEmailThem: "In Cal.com's email to them.",
    message: 'Message to ',
    optional: '(optional)',
    emailedThemAnswer: 'Emailed to them with your answer.',
    accepting: 'Accepting…',
    accept: 'Accept',
    declining: 'Declining…',
    decline: 'Decline',
  },
  // features/meetings/MeetingsCalendar/MeetingsCalendar.tsx
  meetingsCalendar: {
    meetings: 'Meetings',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    bookedThroughCalCom: 'Booked through Cal.com. Your phone reminds you a day, 2 hours and 5 minutes before each accepted meeting, and when it starts.',
    loadingMeetings: 'Loading meetings…',
    meetingsCouldntLoaded: "Meetings couldn't be loaded.",
    n1Request: '1 request is',
    requestsAre: (requestCount: number) => `${requestCount} requests are`,
    dayLabel: (day: string, meetings: number) => `${day}${meetings ? `, ${meetings} ${meetings === 1 ? 'meeting' : 'meetings'}` : ''}`,
    waitingMonth: 'waiting for you this month.',
    noMeetingsDay: 'No meetings this day.',
    notConversation: 'Not from a conversation',
  },
  // features/notifications/AlertChannelsCard/AlertChannelsCard.tsx
  alertChannelsCard: {
    ntfyApp: 'The ntfy app',
    sitesNotifications: "This site's notifications",
    notSetUpAdd: 'Not set up: add a topic in Settings → ntfy.',
    noDeviceYetAllow: 'No device yet: allow them on one below.',
    deviceGetsThemNow: 'This device gets them now. Send it a test to check.',
    notificationsAreBlockedHere: 'Notifications are blocked here: see below.',
    sentShouldShowMoment: (label: string) => `Sent to ${label}: it should show in a moment.`,
    couldntSentIfWas: (label: string) => `It couldn't be sent to ${label}. If it was removed from the Home Screen, allow them there again.`,
    whereTheyGo: 'Where they go',
    eachAlertGoesEvery: "Each alert goes every way that's on.",
    loadingWhereTheyGo: 'Loading where they go…',
    whereTheyGoCouldnt: "Where they go couldn't be loaded.",
    devicesSitesNotifications: "Devices with this site's notifications",
    noneYet: 'None yet.',
    device: 'This device',
    added: 'Added ',
    lastSent: (lastSentAt: string) => ` · last sent ${lastSentAt}`,
    nothingSentYet: ' · nothing sent yet',
    sendTest: 'Send a test',
    notifications: (label: string) => `notifications on ${label}`,
    stopsGettingThemAllow: 'It stops getting them. Allow them on it again to have them back.',
    deviceGetsThemRemove: 'This device gets them. Remove it above to stop.',
    allowing: 'Allowing…',
    getThemDevice: 'Get them on this device',
    notificationsAreBlockedSite: 'Notifications are blocked for this site here. Allow them in the settings (on an iPhone: Settings → Notifications → jechel.dev), then come back.',
    iphoneIpadTheyCome: 'On an iPhone or iPad, they come to the site on the Home Screen: in Safari, Share → Add to Home Screen, open it from there, and allow them here.',
    browserCantGetNotifications: "This browser can't get notifications.",
  },
  // features/notifications/webPush.ts
  webPush: {
    macintosh: 'Macintosh',
    android: 'Android',
    windows: 'Windows',
    linux: 'Linux',
    computer: 'A computer',
    homeScreenApp: 'Home Screen app',
    edge: 'Edge',
    firefox: 'Firefox',
    chrome: 'Chrome',
    safari: 'Safari',
    browser: 'a browser',
  },
  // features/preview/PreviewSwitch/PreviewSwitch.tsx
  previewSwitch: {
    normal: 'Normal',
    loading: 'Loading',
    error: 'Error',
    previewSite: 'Preview the site as',
  },
  // features/resume/ResumeDownloads/ResumeDownloads.tsx
  resumeDownloads: {
    notGeneratedYet: 'Not generated yet.',
    downloadPrivateCopy: 'Download private copy',
    downloadPublicCopy: 'Download public copy',
  },
  // features/resume/ResumePanel/ResumePanel.tsx
  resumePanel: {
    linksSiteGithubLinkedin: 'Links (this site, GitHub, LinkedIn)',
    problemSolvingLeetcodeNeetcode: 'Problem solving (LeetCode, NeetCode)',
    whereIveBeenList: "Where I've been (as a list)",
    bothRSumS: 'Both résumés are ready. Visitors now download the public copy.',
    rSumSCouldnt: "The résumés couldn't be generated. Please try again.",
    rSumSettingsCouldnt: "The résumé settings couldn't be loaded.",
    generating: 'Generating…',
    generateRSumS: 'Generate résumés',
    saveWithoutGenerating: 'Save without generating',
    lastGenerated: (generatedAt: string) => `Last generated ${generatedAt}.`,
    rSumGenerator: 'Résumé generator',
    onlySee: '· only you see this',
    sectionsInclude: 'Sections to include',
    skillsShow: 'Skills to show',
  },
  // features/resume/ResumeSkeleton/ResumeSkeleton.tsx
  resumeSkeleton: {
    loadingRSumSettings: 'Loading the résumé settings…',
  },
  // features/site/ComingSoonPage/ComingSoonPage.tsx
  comingSoonPage: {
    comingSoon: 'Coming soon',
    siteGettingReadyPlease: 'The site is getting ready. Please check back soon.',
  },
  // features/site/MaintenanceScreen/MaintenanceScreen.tsx
  maintenanceScreen: {
    wellRightBack: "We'll be right back",
    cantReachSiteRight: "Can't reach the site right now",
    siteHavingSomeWork: 'The site is having some work done. Please check back soon.',
    mayDownMomentPage: 'It may be down for a moment. This page checks again every half a minute and comes back by itself.',
    tryAgain: 'Try again',
  },
  // features/site/SiteVisibility/SiteVisibility.tsx
  siteVisibility: {
    contact: 'Contact',
    buyMeCoffee: 'Buy me a coffee',
    workMe: 'Work with me',
    visitorsDontSeeButton: "Visitors don't see the button yet: it needs a page link (Buy Me a Coffee, below).",
    loadingVisitorPages: 'Loading the visitor pages…',
    visitorPagesCouldntLoaded: "The visitor pages couldn't be loaded.",
    visitorPages: 'Visitor pages',
    everyPageOffVisitors: 'With every page off, visitors get "Coming soon".',
    pages: 'Pages',
    features: 'Features',
    maintenance: 'Maintenance',
    underMaintenance: 'Under maintenance',
    messageMaintenancePageOptional: 'Message on the maintenance page (optional)',
    back1800: 'Back by 18:00',
    on: 'On',
    off: 'Off',
  },
  // features/support/SupportButton/SupportButton.tsx
  supportButton: {
    buyMeCoffeeOpens: 'Buy me a coffee (opens in a new tab)',
    buyMeCoffee: 'Buy me a coffee',
  },
  // features/terms/ConsentList/ConsentList.tsx
  consentList: {
    confirm: 'Confirm this',
    confirmEachThese: 'Confirm each of these',
  },
  // features/terms/TermsDialog/TermsDialog.tsx
  termsDialog: {
    termsCouldntLoaded: "The terms couldn't be loaded.",
  },
  // features/terms/TermsDocumentView/TermsDocumentView.tsx
  termsDocumentView: {
    lastUpdated: 'Last updated ',
  },
  // features/terms/TermsEditor.tsx
  termsEditor: {
    introduction: 'Introduction',
    optionalShownBeforeSections: 'Optional. Shown before the sections.',
    addSection: 'Add section',
    section: 'Section ',
    heading: 'Heading',
    blockOfSection: (isParagraph: boolean, n: number, section: number) => `${isParagraph ? 'paragraph' : 'bullet list'} ${n} of section ${section}`,
    paragraph: 'Paragraph',
    bulletList: 'Bullet list',
    textParagraph: (value: number) => `Text of paragraph ${value}`,
    addParagraph: 'Add paragraph',
    addBulletList: 'Add bullet list',
  },
  // features/terms/TermsGate/TermsGate.tsx
  termsGate: {
    iHaveReadI: 'I have read and I accept the Terms and Conditions of this website.',
    welcomeJechelDev: 'Welcome to jechel.dev',
    beforeContinuePleaseRead: 'Before you continue, please read the',
    confirmAcceptThem: 'and confirm that you accept them.',
    tickBoxContinue: 'Tick the box to continue.',
    continue: 'Continue',
  },
  // features/terms/TermsSkeleton/TermsSkeleton.tsx
  termsSkeleton: {
    loadingTerms: 'Loading the terms…',
  },
  // features/updates/SubscribeButton/SubscribeButton.tsx
  subscribeButton: {
    getUpdatesEmail: 'Get updates by email',
  },
  // features/updates/SubscribeDialog/SubscribeDialog.tsx
  subscribeDialog: {
    enterValidEmailAddress: 'Enter a valid email address.',
    tooManyTriesPlease: 'Too many tries. Please try again in a few minutes.',
    emailUpdatesArentOpen: "Email updates aren't open right now. Please try again later.",
    didntWorkPleaseTry: "That didn't work. Please try again later.",
    almostThereCheck: 'Almost there: check ',
    clickLinkEmailConfirm: ' and click the link in the email to confirm.',
    weAlreadySentConfirmation: 'We already sent a confirmation to ',
    alreadySubscribedYoullGet: " is already subscribed: you'll get an email when there's something new.",
    subscribing: 'Subscribing…',
    subscribe: 'Subscribe',
    nothingArrivedLookSpam: 'Nothing arrived? Look in spam, or try again in 10 minutes.',
  },
  // features/updates/SubscribeForm/SubscribeForm.tsx
  subscribeForm: {
    getEmailWhenTheres: "Get an email when there's a new app or YouTube video. No spam, and you can unsubscribe from any email in one click.",
  },
  // features/updates/SubscribeSent/SubscribeSent.tsx
  subscribeSent: {
    done: 'Done',
  },
  // features/updates/UpdateEmailsEditor/UpdateEmailsEditor.tsx
  updateEmailsEditor: {
    confirmation: 'Confirmation',
    newVideo: 'New video',
    newApp: 'New app',
    savedNewEmailsUse: 'Saved. New emails use this wording.',
    someFieldsNeedLook: 'Some fields need a look.',
    fixFieldsMarkedFirst: 'Fix the fields marked first.',
    testCouldntSentPlease: "The test couldn't be sent. Please try again.",
    previewUpdateEmails: 'Preview update emails',
    saved: 'Saved ',
    loadingEmailsWording: "Loading the emails' wording…",
    emailsWordingCouldntLoaded: "The emails' wording couldn't be loaded.",
    whichEmail: 'Which email',
    needsLook: '· needs a look',
    underEveryEmail: 'Under every email',
    whyTheyGet: 'Why they get it',
    aboutReplies: 'About replies',
    preview: 'Preview',
    subject: 'Subject',
    previewEmail: (kind: string) => `Preview of the ${kind} email`,
    previewCouldntMade: "The preview couldn't be made.",
    makingPreview: 'Making the preview…',
    sendMeTest: (kind: string) => `Send me a test (${kind})`,
    unsavedChangesSubscribersStill: 'Unsaved changes: subscribers still get the saved wording.',
    button: 'Button',
    note: 'Note',
  },
  // features/updates/UpdatesCard/UpdatesCard.tsx
  updatesCard: {
    emailUpdates: 'Email updates',
  },
  // features/whatsNew/LatestApp/LatestApp.tsx
  latestApp: {
    newApp: 'New app',
  },
  // features/whatsNew/LatestVideo/LatestVideo.tsx
  latestVideo: {
    newVideo: 'New video',
    watchYoutube: 'Watch on YouTube',
  },
  // features/workWithMe/currencies.ts
  currencies: {
    euro: 'Euro',
    romanianLeu: 'Romanian leu',
    britishPound: 'British pound',
    czechKoruna: 'Czech koruna',
    danishKrone: 'Danish krone',
    kr: 'kr.',
    hungarianForint: 'Hungarian forint',
    ft: 'Ft',
    polishZOty: 'Polish złoty',
    swedishKrona: 'Swedish krona',
  },
  // features/workWithMe/CurrencyPicker/CurrencyPicker.tsx
  currencyPicker: {
    enter: 'Enter',
    favourites: 'Favourites',
    otherCurrencies: 'Other currencies',
  },
  // features/workWithMe/WorkWithMe/WorkWithMe.tsx
  workWithMe: {
    websitesEndEnd: 'Websites, end to end',
    fullStackWebsitesDatabase: 'Full-stack websites, from the database to the page you see: designed, built, tested and put live.',
    apisAppsPartnersCan: 'APIs your apps and partners can rely on: secure, documented and tested.',
    automationsCompany: 'Automations for your company',
    manualWorkTeamRepeats: 'The manual work your team repeats every day, done automatically, and your apps connected so data flows between them.',
    freeCallMeeting: 'A free call or meeting',
    onlinePersonWhicheverSuits: 'Online or in person, whichever suits you and where you are. You tell me what you need.',
    plan: 'A plan',
    iWorkOutWhat: 'I work out what to build and how, step by step.',
    planPresented: 'The plan, presented',
    iWalkThroughDecide: 'I walk you through it, and you decide whether to go ahead.',
    priceThenBuilding: 'Price, then building',
    weAgreePriceI: 'We agree the price, I build it, and we keep each other in the loop all the way.',
    hour: 'an hour',
    finalPriceAgreedTogether: "The final price is agreed together, once you've seen the plan.",
    whatIDo: 'What I do',
    howWorks: 'How it works',
  },
  // features/workWithMe/WorkWithMePrice/WorkWithMePrice.tsx
  workWithMePrice: {
    giveAmountLike25: 'Give an amount like 25 or 30.50 (at most two decimals).',
    giveAmountMoreThan: (maxAmount: string) => `Give an amount more than 0 and at most ${maxAmount}.`,
    price: 'Price',
    price2: 'the price',
    editPrice: 'Edit the price',
    currency: 'Currency',
    amount: (per: string) => `Amount, ${per}`,
    priceCouldntLoaded: "The price couldn't be loaded.",
    loadingPrice: 'Loading the price…',
  },
  // features/youtube/RefreshVideosButton/RefreshVideosButton.tsx
  refreshVideosButton: {
    noAnswer: 'no answer',
    apiCouldntReachedCheck: "The API couldn't be reached. Check the connection, then try again.",
    sessionHasEndedSign: 'Your session has ended. Sign in again, then refresh.',
    youtubeCantReachedRight: "YouTube can't be reached right now, or isn't set up (Settings). The videos shown are the last ones saved.",
    refreshYoutubeFailed: 'Refresh from YouTube failed',
    when: (at: string) => `When: ${at}`,
    request: (value: string) => `Request: ${value}`,
    status: (value: string | number | null | undefined) => `Status: ${value}`,
    api: (detail: string) => `API: ${detail}`,
    cause: (cause: string) => `Cause: ${cause}`,
    refreshingYoutube: 'Refreshing from YouTube…',
    upDateYoutube: (count: number, text: string) => `Up to date: ${count} ${text} on YouTube.`,
    couldntRefreshYoutube: "Couldn't refresh from YouTube.",
    refreshYoutube: 'Refresh from YouTube',
    couldntRefreshYoutube2: "Couldn't refresh from YouTube",
    details: 'Details',
    errorDetails: 'the error details',
  },
  // features/youtube/YouTubePlayer/YouTubePlayer.tsx
  youTubePlayer: {
    accelerometerAutoplayClipboardWrite: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
  },
  // layout/AdminBar/AdminBar.tsx
  adminBar: {
    admin: 'Admin',
    maintenanceVisitorsSeeMaintenance: 'Maintenance on: visitors see the maintenance page',
    signed: 'Signed in as ',
    signOut: 'Sign out',
  },
  // layout/background/RivieraBackground/RivieraBackground.tsx
  rivieraBackground: {
    thanksStopping: 'Thanks for stopping by!',
  },
  // layout/Brand/BrandJ.tsx
  brandJ: {
    j: 'j',
  },
  // layout/ContentToggle/ContentToggle.tsx
  contentToggle: {
    showPage: 'Show page',
    hidePage: 'Hide page',
  },
  // layout/SiteFooter/SiteFooter.tsx
  siteFooter: {
    jechelDev: 'jechel.dev',
  },
  // layout/SlowSceneNotice/SlowSceneNotice.tsx
  slowSceneNotice: {
    darkMode: 'dark mode',
    lightMode: 'light mode',
    vice: 'Vice',
    viceWasRunningSlowly: 'Vice was running slowly on this device, so the site switched to ',
    useViceAnyway: 'Use Vice anyway',
    ok: 'OK',
  },
  // layout/SystemNav/SystemNav.tsx
  systemNav: {
    system: 'System',
  },
  // layout/TabLink/TabLink.tsx
  tabLink: {
    hiddenVisitors: 'Hidden from visitors',
    hiddenVisitors2: '(hidden from visitors)',
  },
  // layout/TabNav/TabNav.tsx
  tabNav: {
    sections: 'Sections',
  },
  // layout/tabs.ts
  tabs: {
    engagement: 'Engagement',
    community: 'Community',
    notifications: 'Notifications',
    terms: 'Terms',
    settings: 'Settings',
    featureTesting: 'Feature Testing',
    contact: 'Contact',
    system: 'System',
  },
  // layout/ThemeSwitch/ThemeSwitch.tsx
  themeSwitch: {
    darkMode: 'Dark mode',
    lightMode: 'Light mode',
    viceMode: 'Vice mode',
    theme: 'Theme',
  },
  // layout/UserBar/UserBar.tsx
  userBar: {
    developmentTools: 'Development tools',
    user: 'User',
    resetTermsAcceptance: 'Reset terms acceptance',
  },
  // pages/AboutPage/AboutPage.tsx
  aboutPage: {
    loadingAboutMe: 'Loading About Me…',
    pageCouldntLoaded: "This page couldn't be loaded.",
  },
  // pages/AdminPage/AdminPage.tsx
  adminPage: {
    googleAccountNotAllowed: 'This Google account is not allowed to access the admin area.',
    googleSignWasCancelled: 'Google sign-in was cancelled or failed. Please try again.',
    somethingWentWrongPlease: 'Something went wrong. Please try again.',
    adminSign: 'Admin sign in',
  },
  // pages/AppsPage/AppsPage.tsx
  appsPage: {
    loadingApps: 'Loading apps…',
    noAppsYet: 'No apps yet.',
    appsCantLoadedRight: "The apps can't be loaded right now.",
  },
  // pages/CommunityPage/CommunityPage.tsx
  communityPage: {
    community: 'Community',
    emailSubscribers: 'Email subscribers',
    all: 'in all',
    loadingSubscribers: 'Loading subscribers…',
    subscribersCouldntLoaded: "Subscribers couldn't be loaded.",
    subscribersTable: 'Subscribers table',
    since: 'Since',
    actions: 'Actions',
    confirmed: 'Confirmed',
    waitingConfirmation: 'Waiting for confirmation',
    waiting: 'Waiting for you',
    sent: 'To be sent',
    sent2: 'Sent',
    notSent: 'Not sent',
    updateEmails: 'Update emails',
    loadingUpdateEmails: 'Loading the update emails…',
    updateEmailsCouldntLoaded: "The update emails couldn't be loaded.",
    video: 'Video',
    app: 'App',
    sentSoFar: (recipientCount: number) => `${recipientCount} sent so far`,
    toSubscribers: (count: number) => `to ${count} ${count === 1 ? 'subscriber' : 'subscribers'}`,
    sendEmail: 'Send email',
    ignore: 'Ignore',
    coffeesBuyMeCoffee: 'Coffees (Buy Me a Coffee)',
    loadingCoffees: 'Loading coffees…',
    coffeesCouldntLoaded: "Coffees couldn't be loaded.",
    donationsTable: 'Donations table',
    amount: 'Amount',
    received: 'Received',
    test: 'Test',
    noMessage: 'No message',
  },
  // pages/ConfirmSubscriptionPage/ConfirmSubscriptionPage.tsx
  confirmSubscriptionPage: {
    confirming: 'Confirming…',
    youreSubscribed: "You're subscribed as ",
    youreSubscribedYoullGet: "You're subscribed. You'll get an email when there's a new app or video.",
    linkTestEmailSo: 'This link is from a test email, so it changes nothing. The button in the real confirmation email confirms the subscription.',
    linkIsntValidAny: 'This link isn\'t valid any more. Subscribe again with "Get updates" at the top of the page.',
    didntWorkPleaseTry: "That didn't work. Please try the link again later.",
    seeWhatsNew: "See what's new",
    subscribeMyYoutubeChannel: 'Subscribe to my YouTube channel',
  },
  // pages/EngagementPage/EngagementPage.tsx
  engagementPage: {
    n1Hour: '1 hour',
    n1Day: '1 day',
    n7Days: '7 days',
    n30Days: '30 days',
    n90Days: '90 days',
    n1Year: '1 year',
    n5Years: '5 years',
    allTime: 'All time',
    summary: 'Summary',
    visit: 'Visit',
    engagement: 'Engagement',
    period: 'Period',
    refresh: 'Refresh',
    loadingNumbers: 'Loading the numbers…',
    numbersCouldntLoaded: "The numbers couldn't be loaded.",
    topPages: 'Top pages',
    whereVisitorsCome: 'Where visitors come from',
    mostClicked: 'Most clicked',
    whatVisitorsDid: 'What visitors did',
    nothingReportedYet: 'Nothing reported yet.',
    noErrors: 'No errors. 🎉',
    preferredTheme: 'Preferred theme',
    themeSwitches: 'Theme switches',
    nobodyHasSwitchedYet: 'Nobody has switched yet.',
    devices: 'Devices',
    browsers: 'Browsers',
    countries: 'Countries',
    timeZones: 'Time zones',
  },
  // pages/FeatureTestingPage/FeatureTestingPage.tsx
  featureTestingPage: {
    featureTesting: 'Feature Testing',
    features: 'Features',
    noFeaturesTestRight: 'No features to test right now',
    newFeaturesShowUp: 'New features show up here first, for you to try on the site before visitors see them.',
  },
  // pages/NotificationsPage/NotificationsPage.tsx
  notificationsPage: {
    sitesNotifications: "this site's notifications",
    sent: 'Sent',
    offNotSent: 'Off: not sent',
    notSetUpNot: 'Not set up: not sent',
    failed: 'Failed',
    bothWaysOffNot: 'Both ways off: not sent',
    notifications: 'Notifications',
    phone: 'On your phone',
    loadingNotifications: 'Loading the notifications…',
    notificationsCouldntLoaded: "The notifications couldn't be loaded.",
    n30DaysLast: (last30Days: number, lastAt: string) => `${last30Days} in 30 days · last ${lastAt}`,
    noneYet: 'None yet',
    history: 'History',
    all: 'in all',
    refresh: 'Refresh',
    kind: 'Kind',
    everyKind: 'Every kind',
    loadingHistory: 'Loading the history…',
    historyCouldntLoaded: "The history couldn't be loaded.",
    to: 'to ',
  },
  // pages/SettingsPage/SettingsPage.tsx
  settingsPage: {
    setUp: 'Set up',
    partlySetUp: 'Partly set up',
    notSetUp: 'Not set up',
    notSet: 'not set',
    savedHere: 'saved here',
    serverConfiguration: 'from the server configuration',
    setEnds: (hint: string, where: string) => `set, ends in ${hint}, ${where}`,
    set: (where: string) => `set, ${where}`,
    settings: 'Settings',
    loadingSettings: 'Loading the settings…',
    settingsCouldntLoaded: "The settings couldn't be loaded.",
    buyMeCoffee: 'Buy Me a Coffee',
    page: 'Your page',
    dashboard: 'Dashboard',
    dashboardOpen: 'In the dashboard, open ',
    integrationsWebhooks: 'Integrations → Webhooks',
    addLinkDonations: 'and add this link for donations:',
    copyWebhooksSecretInto: "Copy the webhook's secret into the field below and save. Then, on that webhook in Buy Me a Coffee's dashboard, press ",
    sendTest: 'Send test',
    coffeeMarkedTestShould: ': a coffee marked Test should land in the Community tab and on your phone.',
    calComMeetings: 'Cal.com (meetings)',
    invitationAddBookingLink:
      'By invitation: Add booking link in your answers, the calendar above your messages, accepting or declining requests (here or from your phone), and the reminders.',
    eventTypes: 'Event types',
    webhooks: 'Webhooks',
    apiKeys: 'API keys',
    checkApiKey: 'Check the API key',
    in: 'In ',
    makeOneEG: ', make one (e.g. 30 minutes), set your availability, turn on ',
    hidden: 'Hidden',
    onlyPeopleSendLink: '(only people you send the link can book), and under ',
    advanced: 'Advanced',
    turn: 'turn on ',
    requiresConfirmation: 'Requires confirmation',
    soAcceptEachRequest: ', so you accept each request. Paste its link below.',
    addLinkSecretChoice: ', add this link, with a secret of your choice, for Booking requested, created, rescheduled, cancelled and rejected:',
    pasteSameSecretBelow: 'Paste the same secret below, then make an ',
    apiKey: 'API key',
    settingsDeveloperPasteToo: '(Settings → Developer) and paste it too: it lets this site accept and decline for you.',
    googleSign: 'Google sign-in',
    googleCloudOauthClients: 'Google Cloud: OAuth clients',
    client: (clientIdHint: string) => ` · client ${clientIdHint}`,
    admins: 'Admins',
    n1EmailAllowed: '1 email allowed',
    emailsAllowed: (adminEmailCount: number) => `${adminEmailCount} emails allowed`,
    redirectUriRegister: 'Redirect URI to register',
    hosting: 'Hosting',
    cloudflare: 'Cloudflare',
    sliplane: 'Sliplane',
    ntfyPhoneAlerts: 'ntfy (phone alerts)',
    phoneAppGuide: 'Phone app guide',
    sendTestAlert: 'Send a test alert',
    press: 'Press ',
    generate: 'Generate',
    belowPrivateTopicName: 'below for a private topic name, and ',
    ntfyAppTap: 'In the ntfy app, tap ',
    typeSameTopicServer: ', type the same topic (server: ntfy.sh), and ',
    subscribe: 'Subscribe',
    anyoneWhoKnowsTopic: '. Anyone who knows the topic can read it, so keep it long and random.',
    ownNtfyServerReserved: 'Your own ntfy server, or a reserved topic',
    porkbunDomain: 'Porkbun (domain)',
    porkbun: 'Porkbun',
    resendEmail: 'Resend (email)',
    domains: 'Domains',
    sendMeTestEmail: 'Send me a test email',
    claudiuJechelDevHello: 'Claudiu from jechel.dev <hello@jechel.dev>',
    jechelDevUpdatesJechel: 'jechel.dev <updates@jechel.dev>',
    receivingEmail: 'Receiving email',
    openDomainTurn: ', open your domain, turn on ',
    receiving: 'Receiving',
    addMxRecordPorkbun: ', and add its MX record at Porkbun.',
    addLink: ', add this link for ',
    emailReceived: 'email.received',
    pasteSigningSecretBelow: "Paste its signing secret below. Emails to the sender's address then land in Contact.",
    youtubeDataApi: 'YouTube Data API',
    googleCloudApiKeys: 'Google Cloud: API keys',
    youtubeStudio: 'YouTube Studio',
    listMyVideos: 'List my videos',
    connections: 'Connections',
    link: 'link',
    testCouldntRunPlease: "The test couldn't run. Please try again.",
    testing: 'Testing…',
    removed: 'Removed.',
    pasteNewValueReplace: 'Paste a new value to replace it',
    pasteHere: 'Paste it here',
  },
  // pages/TermsPage/TermsPage.tsx
  termsPage: {
    someFieldsNeedFixing: 'Some fields need fixing; see the messages above.',
    termsCouldntLoaded: "The terms couldn't be loaded.",
    editTerms: 'Edit the terms',
    savingChangesDateTop: 'Saving changes the date at the top, and asks every visitor to accept the terms again.',
    terms: 'the terms',
  },
  // pages/UnsubscribePage/UnsubscribePage.tsx
  unsubscribePage: {
    unsubscribing: 'Unsubscribing…',
    youreUnsubscribedNoMore: "You're unsubscribed: no more emails. Sorry to see you go.",
    linkTestEmailSo: "This link is from a test email, so it changes nothing: you weren't subscribed when it was sent.",
    linkIsntCompleteOpen: "This link isn't complete. Open it again from the email.",
    didntWorkPleaseTry: "That didn't work. Please try the link again later.",
    backSite: 'Back to the site',
  },
  // pages/WhatsNewPage/WhatsNewPage.tsx
  whatsNewPage: {
    appVideo: 'app and video',
    appsVideos: 'apps and videos',
    loadingWhatsNew: "Loading what's new…",
    newestCantLoadedRight: (newest: string) => `The newest ${newest} can't be loaded right now.`,
    nothingHereYetNew: (added: string) => `Nothing here yet. New ${added} will show up here.`,
    appsYoutubeAreHidden: "Apps and YouTube are hidden from visitors (Settings → Visitor pages), so What's new? has nothing to show them.",
    visitorsSeeHiddenThem: (hidden: string, shown: string) => `As visitors see it: ${hidden} is hidden from them (Settings → Visitor pages), so only ${shown} count.`,
    youtube: 'YouTube',
    app: 'app',
    apps: 'apps',
    video: 'video',
    videos: 'videos',
  },
  // pages/YouTubePage/YouTubePage.tsx
  youTubePage: {
    videos: 'Videos',
    loadingVideos: 'Loading videos…',
    noVideosYet: 'No videos yet.',
    videosCantLoadedRight: "The videos can't be loaded right now.",
    youtube: 'YouTube',
    visitMyYoutubePage: 'Visit my YouTube page',
  },
} as const
