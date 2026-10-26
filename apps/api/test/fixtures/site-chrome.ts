export const contentFixture = () => ({ schemaVersion: 1, homeSections: [{ key: 'hero', enabled: true }], homeCopy: { categoryHeading: '', bestsellersHeading: '', socialHeading: '', ticker: '', testimonialHeading: '', testimonialSubheading: '' }, campaigns: [], instagramPosts: [{ href: 'https://www.instagram.com/p/test/', src: '/media/room.webp', alt: 'Room' }], pages: [], motion: { autoplaySocial: false, autoplayCities: false, revealSections: false } });
export const chromeLink = (id = 'contact', href = '/pages/contact') => ({ id, label: 'Contact', href, enabled: true });
export const chromeFixture = () => ({
  announcement: { text: 'Welcome home', href: '/collections/all', enabled: true },
  utilityLinks: [chromeLink('account', '/account')],
  navigation: [{ ...chromeLink('living', '/collections/chairs'), feature: 'living', columns: [{ id: 'chairs', links: [{ ...chromeLink('chair', '/collections/chairs'), parent: true }] }] }],
  desktopDiscovery: [{ ...chromeLink('story', '/pages/our-story'), cta: 'Discover' }],
  mobileQuickLinks: [chromeLink('favourites', '/favourites')],
  footer: {
    columns: [{ key: 'shop', enabled: true }, { key: 'help', enabled: true }, { key: 'care', enabled: true }],
    contactColumns: [{ key: 'bulk', enabled: true }, { key: 'service', enabled: true }, { key: 'marketplace', enabled: true }],
    shopHeading: 'Shop', helpHeading: 'Help', careHeading: 'Care', shopLinks: [chromeLink('chairs', '/collections/chairs')], helpLinks: [chromeLink()], policyLinks: [chromeLink('privacy', '/policies/privacy-policy')],
    addressLines: ['Example studio'], customerPhone: '+911234567890', customerPhoneLabel: 'Call us', customerEmail: 'care@example.invalid', contactHeading: 'Contact', bulkHeading: 'Bulk', serviceHeading: 'Service', findUsHeading: 'Find us', bulkPhone: '+911234567891', bulkPhoneLabel: 'Call bulk', bulkEmail: 'bulk@example.invalid', copyrightName: 'Maple', instagram: 'https://www.instagram.com/maple_studio/', linkedin: 'https://www.linkedin.com/company/maple-studio/',
  },
  whatsapp: { enabled: true, phone: '+911234567890', label: 'Chat with us' },
});
