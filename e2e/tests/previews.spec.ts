import { expect, test } from './fixtures.ts'

// Link previews and search: what LinkedIn, Slack or Google read. They don't run the app, so this is checked in the
// page as served (the HTML itself), plus the image, robots.txt and the sitemap.

const meta = (html: string, key: string) => html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1]

test('every page carries a description, an Open Graph card with its image, and who the site is about', async ({ request }) => {
  for (const path of ['/', '/apps', '/about']) {
    const html = await (await request.get(path)).text()
    expect(html).toContain('<title>Claudiu Mihai Jechel</title>')
    expect(meta(html, 'description')).toMatch(/portfolio/)
    expect(meta(html, 'og:title')).toBe('Claudiu Mihai Jechel')
    expect(meta(html, 'og:image')).toBe('https://jechel.dev/og-image.jpg')
    expect(meta(html, 'og:image:width')).toBe('1200')
    expect(meta(html, 'og:image:height')).toBe('630')
    expect(meta(html, 'twitter:card')).toBe('summary_large_image')

    const person = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1])
    expect(person).toMatchObject({ '@type': 'Person', name: 'Claudiu Mihai Jechel', url: 'https://jechel.dev/' })
    expect(person.sameAs).toContain('https://github.com/ClaoMike')
  }
})

test('the preview image is there: a 1200 × 630 JPEG', async ({ page }) => {
  const response = await page.request.get('/og-image.jpg')
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/jpeg')
  await page.goto('/og-image.jpg')
  const size = await page.locator('img').evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])
  expect(size).toEqual([1200, 630])
})

test('robots.txt lets search engines in, keeps them off /api, and points to the sitemap', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text()
  expect(robots).toContain('User-agent: *')
  expect(robots).toContain('Disallow: /api/')
  expect(robots).toContain('Sitemap: https://jechel.dev/sitemap.xml')
})

test("the sitemap lists the visitors' pages, and each one opens", async ({ page }) => {
  const xml = await (await page.request.get('/sitemap.xml')).text()
  const paths = [...xml.matchAll(/<loc>https:\/\/jechel\.dev([^<]*)<\/loc>/g)].map((m) => m[1])
  expect(paths).toEqual(['/', '/apps', '/youtube', '/about', '/contact', '/terms'])
  for (const path of paths) {
    await page.goto(path)
    await expect(page).toHaveURL(path)
    await expect(page.locator('main')).not.toBeEmpty()
  }
})
