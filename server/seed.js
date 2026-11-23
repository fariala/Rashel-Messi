'use strict';

const { hashPassword, generateId } = require('./lib/security');

const DAY = 24 * 60 * 60 * 1000;

const daysAgo = (days, hour = 10) => {
    const date = new Date(Date.now() - days * DAY);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
};

const todayAt = (hour, minute) => {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
};

const inviteContent = () => ({
    meta: {
        title: 'Rashel & Adrian - Wedding Invitation',
        description: 'With joy, we invite you to celebrate the wedding of Rashel and Adrian on Saturday, 12 June 2027 in Ubud, Bali.',
        hashtag: '#RashelAndAdrian',
        coverImage: '/assets/images/sas/cover.svg',
        music: {
            enabled: true,
            url: '/assets/music/pure-love-304010.mp3',
            title: 'Pure Love',
        },
    },
    hero: {
        eyebrow: 'The Wedding Of',
        headline: 'Rashel & Adrian',
        dateLabel: 'Saturday, 12 June 2027',
        location: 'The Amara Estate, Ubud - Bali',
    },
    quote: {
        text: 'And of His signs is that He created for you mates from among yourselves, that you may find tranquillity in them; and He placed between you affection and mercy.',
        source: 'Ar-Rum 21',
    },
    couple: {
        bride: {
            fullName: 'Rashel Amara',
            nickname: 'Rashel',
            role: 'The Bride',
            photo: '/assets/images/sas/bride.svg',
            childOrder: 'The first daughter of',
            father: 'Mr. Handoko Wijaya',
            mother: 'Mrs. Lestari Wijaya',
            instagram: '@rashelamara',
            bio: 'Architect, plant collector, and the calmest person in every room. Rashel loves slow mornings, rainy playlists and the ocean at dusk.',
        },
        groom: {
            fullName: 'Adrian Wirawan',
            nickname: 'Adrian',
            role: 'The Groom',
            photo: '/assets/images/sas/groom.svg',
            childOrder: 'The second son of',
            father: 'Mr. Bambang Wirawan',
            mother: 'Mrs. Susanti Wirawan',
            instagram: '@adrianwirawan',
            bio: 'Product designer, weekend barista, and the one who always plans the next trip. Adrian proposed on a hill in Ubud, right before sunrise.',
        },
    },
    events: [
        {
            id: 'evt_ceremony',
            type: 'Ceremony',
            title: 'Holy Matrimony',
            date: '2027-06-12',
            startTime: '16:00',
            endTime: '17:30',
            venue: 'The Amara Chapel',
            address: 'Jl. Raya Ubud No. 12, Ubud, Gianyar, Bali',
            mapUrl: 'https://maps.google.com/?q=Ubud+Bali',
            note: 'Please arrive 20 minutes before the ceremony begins.',
        },
        {
            id: 'evt_reception',
            type: 'Reception',
            title: 'Dinner & Celebration',
            date: '2027-06-12',
            startTime: '18:00',
            endTime: '22:00',
            venue: 'The Amara Garden',
            address: 'Jl. Raya Ubud No. 12, Ubud, Gianyar, Bali',
            mapUrl: 'https://maps.google.com/?q=Ubud+Bali',
            note: 'Garden formal attire. Dinner is served at 19:00.',
        },
    ],
    story: [
        {
            id: 'story_1',
            date: 'August 2019',
            title: 'A rainy first meeting',
            text: 'We met at a tiny coffee shop in Bandung, both hiding from the rain. Adrian asked to borrow a chair, and stayed to talk until closing time.',
        },
        {
            id: 'story_2',
            date: 'March 2021',
            title: 'Our first trip together',
            text: 'Three days in Yogyakarta with one camera, two backpacks and a long list of places we never actually visited.',
        },
        {
            id: 'story_3',
            date: 'September 2025',
            title: 'The proposal',
            text: 'On a hill above Ubud, just before sunrise, Adrian asked the easiest question of his life. Rashel said yes before he finished the sentence.',
        },
        {
            id: 'story_4',
            date: 'June 2027',
            title: 'Forever begins',
            text: 'And now we are here, inviting the people we love most to celebrate the beginning of our forever.',
        },
    ],
    gallery: [
        { id: 'gal_1', url: '/assets/images/sas/gallery-arch.svg', caption: 'The garden ceremony' },
        { id: 'gal_2', url: '/assets/images/sas/gallery-rings.svg', caption: 'Two rings, one promise' },
        { id: 'gal_3', url: '/assets/images/sas/gallery-table.svg', caption: 'Dinner under the lights' },
        { id: 'gal_4', url: '/assets/images/sas/gallery-wreath.svg', caption: 'Save the date' },
    ],
    gifts: [
        {
            id: 'gift_1',
            type: 'Bank Transfer',
            provider: 'Bank Mandiri',
            accountName: 'Rashel Amara',
            accountNumber: '1370012345678',
            note: 'Please use your name as the transfer note.',
        },
        {
            id: 'gift_2',
            type: 'Bank Transfer',
            provider: 'Bank BCA',
            accountName: 'Adrian Wirawan',
            accountNumber: '5271123456',
            note: 'Thank you for your love and generosity.',
        },
        {
            id: 'gift_3',
            type: 'Wedding Gift',
            provider: 'Send a gift',
            accountName: 'Rashel & Adrian',
            accountNumber: 'Jl. Melati No. 8, Bandung, West Java 40115',
            note: 'Gifts can be delivered to our home address.',
        },
    ],
    rsvp: {
        enabled: true,
        deadline: '2027-05-20',
        maxSeats: 6,
        title: 'Will you celebrate with us?',
        message: 'Please confirm your attendance before 20 May 2027 so we can prepare your seat.',
    },
    dressCode: {
        title: 'Garden Formal',
        text: 'Soft tones and comfortable shoes are recommended - the celebration is outdoors on grass.',
        colors: ['#b76e79', '#c2a26b', '#e8dcc9', '#2c2530'],
    },
    closing: {
        text: 'It would be an honour to have you with us on our special day. Thank you for your love, prayers and support.',
        signature: 'With love, Rashel & Adrian',
    },
});

const guestSeed = [
    { name: 'Alya Putri', category: 'Family', seats: 4, status: 'attending', phone: '+62 812-3456-7801', email: 'alya.putri@example.com', note: 'Aunt from Bandung', message: 'So happy for you both! We will be there with the whole family.', days: 2, invited: 12, checkin: [17, 12] },
    { name: 'Bima Pratama', category: 'Friend', seats: 2, status: 'attending', phone: '+62 812-3456-7802', email: 'bima.pratama@example.com', note: '', message: 'Would not miss it. Save us two seats near the dance floor.', days: 3, invited: 12, checkin: [17, 27] },
    { name: 'Chandra Wijaya', category: 'Colleague', seats: 1, status: 'pending', phone: '+62 812-3456-7803', email: 'chandra.wijaya@example.com', note: 'Met at the studio', message: '', days: 0, invited: 9, checkin: null },
    { name: 'Dewi Lestari', category: 'Family', seats: 3, status: 'attending', phone: '+62 812-3456-7804', email: 'dewi.lestari@example.com', note: '', message: 'Congratulations! We are so proud of you.', days: 4, invited: 12, checkin: [17, 41] },
    { name: 'Eko Nugroho', category: 'Friend', seats: 2, status: 'declined', phone: '+62 812-3456-7805', email: 'eko.nugroho@example.com', note: '', message: 'So sorry, we will be travelling that week. Sending love from afar!', days: 5, invited: 12, checkin: null },
    { name: 'Farah Nadia', category: 'VIP', seats: 2, status: 'attending', phone: '+62 812-3456-7806', email: 'farah.nadia@example.com', note: 'Family friend', message: 'Cannot wait to celebrate with you. It is going to be beautiful.', days: 1, invited: 13, checkin: [17, 55] },
    { name: 'Gilang Ramadhan', category: 'Colleague', seats: 2, status: 'pending', phone: '+62 812-3456-7807', email: 'gilang.ramadhan@example.com', note: '', message: '', days: 0, invited: 9, checkin: null },
    { name: 'Hana Salsabila', category: 'Friend', seats: 1, status: 'attending', phone: '+62 812-3456-7808', email: 'hana.salsabila@example.com', note: 'University friend', message: 'I will be there! Counting the days.', days: 6, invited: 12, checkin: null },
    { name: 'Indra Kusuma', category: 'Family', seats: 5, status: 'attending', phone: '+62 812-3456-7809', email: 'indra.kusuma@example.com', note: '', message: 'The whole family is coming. See you in Bali!', days: 7, invited: 12, checkin: [18, 20] },
    { name: 'Jasmine Hartono', category: 'VIP', seats: 1, status: 'attending', phone: '+62 812-3456-7810', email: 'jasmine.hartono@example.com', note: '', message: 'The invitation is stunning. Cannot wait.', days: 8, invited: 13, checkin: null },
    { name: 'Kevin Wijaya', category: 'Friend', seats: 2, status: 'pending', phone: '+62 812-3456-7811', email: 'kevin.wijaya@example.com', note: '', message: '', days: 0, invited: 8, checkin: null },
    { name: 'Laras Ayu', category: 'Colleague', seats: 1, status: 'attending', phone: '+62 812-3456-7812', email: 'laras.ayu@example.com', note: '', message: 'Would not miss your big day for anything.', days: 9, invited: 12, checkin: [18, 33] },
    { name: 'Made Surya', category: 'Family', seats: 2, status: 'attending', phone: '+62 812-3456-7813', email: 'made.surya@example.com', note: '', message: 'Om Swastyastu, congratulations to both of you.', days: 10, invited: 12, checkin: null },
    { name: 'Nadia Rahma', category: 'Friend', seats: 3, status: 'declined', phone: '+62 812-3456-7814', email: 'nadia.rahma@example.com', note: '', message: 'Sadly we cannot make it, but we will celebrate with you later.', days: 11, invited: 12, checkin: null },
    { name: 'Oscar Lim', category: 'Colleague', seats: 1, status: 'pending', phone: '+62 812-3456-7815', email: 'oscar.lim@example.com', note: '', message: '', days: 0, invited: 8, checkin: null },
    { name: 'Putri Anjani', category: 'Family', seats: 4, status: 'attending', phone: '+62 812-3456-7816', email: 'putri.anjani@example.com', note: '', message: 'Tante and om will arrive a day early. Do you need help with anything?', days: 12, invited: 13, checkin: [18, 47] },
    { name: 'Raka Aditya', category: 'Friend', seats: 2, status: 'attending', phone: '+62 812-3456-7817', email: 'raka.aditya@example.com', note: '', message: 'Congrats man! Booking flights tonight.', days: 13, invited: 12, checkin: null },
    { name: 'Sinta Maharani', category: 'VIP', seats: 2, status: 'attending', phone: '+62 812-3456-7818', email: 'sinta.maharani@example.com', note: '', message: 'Such wonderful news. We will be there.', days: 14, invited: 13, checkin: null },
    { name: 'Taufik Hidayat', category: 'Colleague', seats: 1, status: 'pending', phone: '+62 812-3456-7819', email: 'taufik.hidayat@example.com', note: '', message: '', days: 0, invited: 6, checkin: null },
    { name: 'Umi Kalsum', category: 'Family', seats: 3, status: 'attending', phone: '+62 812-3456-7820', email: 'umi.kalsum@example.com', note: '', message: 'Barakallahu lakuma wa baraka alaikuma.', days: 15, invited: 12, checkin: [19, 2] },
    { name: 'Vina Oktaviani', category: 'Friend', seats: 1, status: 'pending', phone: '+62 812-3456-7821', email: 'vina.oktaviani@example.com', note: '', message: '', days: 0, invited: 5, checkin: null },
    { name: 'Wira Saputra', category: 'Friend', seats: 2, status: 'attending', phone: '+62 812-3456-7822', email: 'wira.saputra@example.com', note: '', message: 'Cannot wait. The venue looks incredible.', days: 16, invited: 12, checkin: null },
];

const codes = [
    'SAS-7KQ4M', 'SAS-2XP9T', 'SAS-5HN3R', 'SAS-9WDFK', 'SAS-4MTYQ',
    'SAS-8CR6J', 'SAS-3PVLZ', 'SAS-6RBHX', 'SAS-2KD9N', 'SAS-7TQWM',
    'SAS-5ZCGV', 'SAS-9HYLP', 'SAS-4FNWK', 'SAS-8DQTR', 'SAS-3MVXJ',
    'SAS-6LPHC', 'SAS-2TFQZ', 'SAS-7WCKN', 'SAS-5GDYM', 'SAS-9QRVB',
    'SAS-4XHPT', 'SAS-8NKZL',
];

/**
 * Build a complete demo database.
 *
 * @returns {object}
 */
const seedDatabase = () => {
    const now = new Date().toISOString();

    const users = [
        {
            id: 'usr_demo_admin',
            name: 'Rashel Amara',
            email: 'admin@saswedding.id',
            passwordHash: hashPassword('wedding123'),
            role: 'Owner',
            createdAt: daysAgo(40, 9),
            lastLoginAt: null,
        },
    ];

    const guests = [];
    const rsvps = [];
    const activity = [];

    guestSeed.forEach((seed, index) => {
        const id = `gst_${String(index + 1).padStart(3, '0')}`;
        const code = codes[index];
        const invitedAt = daysAgo(seed.invited, 9);
        const createdAt = daysAgo(seed.invited + 2, 8);
        const checkedInAt = seed.checkin ? todayAt(seed.checkin[0], seed.checkin[1]) : null;
        const rsvpAt = seed.days ? daysAgo(seed.days, 11 + (index % 8)) : null;

        const guest = {
            id,
            code,
            name: seed.name,
            phone: seed.phone,
            email: seed.email,
            category: seed.category,
            seats: seed.seats,
            rsvpStatus: seed.status,
            rsvpSeats: seed.status === 'attending' ? seed.seats : 0,
            message: seed.message,
            note: seed.note,
            invitedAt,
            rsvpAt,
            checkedInAt,
            createdAt,
            updatedAt: checkedInAt || rsvpAt || createdAt,
        };

        guests.push(guest);

        if (seed.status !== 'pending') {
            rsvps.push({
                id: `rsv_${String(index + 1).padStart(3, '0')}`,
                guestId: id,
                name: seed.name,
                code,
                attendance: seed.status,
                seats: guest.rsvpSeats,
                message: seed.message,
                createdAt: rsvpAt,
                updatedAt: rsvpAt,
            });
        }

        activity.push({
            id: generateId('act'),
            type: 'guest_added',
            message: `${seed.name} was added to the guest list`,
            at: createdAt,
            guestId: id,
        });

        if (seed.days) {
            activity.push({
                id: generateId('act'),
                type: seed.status === 'attending' ? 'rsvp_attending' : 'rsvp_declined',
                message: `${seed.name} ${seed.status === 'attending' ? 'confirmed attendance' : 'declined the invitation'}`,
                at: rsvpAt,
                guestId: id,
            });
        }

        if (checkedInAt) {
            activity.push({
                id: generateId('act'),
                type: 'checkin',
                message: `${seed.name} checked in at the venue`,
                at: checkedInAt,
                guestId: id,
            });
        }
    });

    activity.sort((a, b) => new Date(b.at) - new Date(a.at));

    return {
        meta: {
            version: 1,
            createdAt: now,
            updatedAt: now,
        },
        users,
        settings: {
            brandName: 'SAS Wedding Studio',
            slug: 'rashel-adrian',
            published: true,
            defaultSeats: 2,
            timezone: 'Asia/Makassar',
            theme: {
                primary: '#b76e79',
                accent: '#c2a26b',
                ink: '#2c2530',
                surface: '#fbf7f2',
            },
            createdAt: daysAgo(40, 9),
            updatedAt: now,
        },
        content: inviteContent(),
        guests,
        rsvps,
        activity: activity.slice(0, 120),
    };
};

module.exports = { seedDatabase, inviteContent };

