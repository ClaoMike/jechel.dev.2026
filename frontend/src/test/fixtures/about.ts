/** A full About Me page for tests: every section has something, links included. */
import type { AboutContent } from '../../services/api'
import photo from './photo.svg?no-inline'

export const ABOUT: AboutContent = {
  photoUrl: photo,
  statuses: [
    { text: 'Romanian citizenship', flag: 'RO' },
    { text: 'UK [Settled Status](https://www.gov.uk/settled-status-eu-citizens-families)', flag: 'GB' },
  ],
  links: {
    resumeUrl: '/api/resume/public.pdf',
    gitHubUrl: 'https://github.com/jechel',
    linkedInUrl: 'https://www.linkedin.com/in/jechel',
    instagramUrl: '',
  },
  colors: {
    skills: { work: '#3b82f6', academic: '#a855f7', personal: '#22c55e' },
    places: { worked: '#f97316', studied: '#06b6d4', visited: '#eab308' },
  },
  places: [
    { id: 2643123, name: 'Manchester', region: 'England', country: 'United Kingdom', latitude: 53.48, longitude: -2.24, visits: [{ kind: 'studied', note: 'BSc at [Manchester](https://www.manchester.ac.uk)' }, { kind: 'worked', note: '' }] },
    { id: 683506, name: 'Bucharest', region: 'Bucureşti', country: 'Romania', latitude: 44.43, longitude: 26.1, visits: [{ kind: 'visited', note: 'Home town' }] },
  ],
  problemSolving: { leetCodeUsername: 'jechel', neetCodeLists: ['blind75', 'neetcode150'] },
  skills: [
    { name: 'C#', periods: [{ start: '2018-09-01', end: null, uses: ['work', 'academic'] }] },
    { name: 'React', periods: [{ start: '2020-03-01', end: '2022-06-01', uses: ['personal'] }, { start: '2023-01-01', end: null, uses: ['work'] }] },
    { name: 'COBOL', periods: [] },
  ],
  experience: [
    { title: 'Software Engineer', company: '[Acme](https://acme.example)', location: 'Manchester', start: '2022-07-01', end: null, bullets: ['Built the [booking system](https://acme.example/booking).', 'Led the move to .NET 10.'] },
    { title: 'Intern', company: 'Globex', location: '', start: '2021-06-01', end: '2021-09-01', bullets: [] },
  ],
  education: [{ title: 'BSc Computer Science', institution: '[The University of Manchester](https://www.manchester.ac.uk)', location: 'Manchester', start: '2018-09-01', end: '2022-06-01' }],
  papers: [
    { title: 'Fast tries for [autocomplete](https://example.com/tries)', fileUrl: '/api/files/papers/tries.pdf' },
    { title: 'An unpublished note', fileUrl: '' },
  ],
  qualifications: [
    { title: 'AWS Certified Developer', issuer: '[Amazon](https://aws.amazon.com)', obtained: '2023-05-01', grade: '870/1000' },
    { title: 'First aid', issuer: '', obtained: null, grade: '' },
  ],
  languages: [
    { name: 'Romanian', level: 'native' },
    { name: 'English', level: 'fluent' },
    { name: 'Spanish', level: 'beginner' },
  ],
  licences: [
    { category: 'driving', code: 'B', name: 'Car' },
    { category: 'driving', code: 'AM', name: 'Moped' },
    { category: 'boating', code: '', name: 'Day Skipper' },
    { category: 'other', code: 'T', name: 'Tractor' },
  ],
  hackathons: [{ name: '[HackManchester](https://hackmanchester.com)', year: 2021, bullets: ['Won best use of AI.'] }],
}

/** A copy of the page with nothing in it (photo and links left out too). */
export const EMPTY_ABOUT: AboutContent = {
  ...ABOUT,
  photoUrl: '',
  statuses: [],
  links: { resumeUrl: '', gitHubUrl: '', linkedInUrl: '', instagramUrl: '' },
  places: [],
  problemSolving: { leetCodeUsername: '', neetCodeLists: [] },
  skills: [],
  experience: [],
  education: [],
  papers: [],
  qualifications: [],
  languages: [],
  licences: [],
  hackathons: [],
}
