import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, closeDb } from "../src/db/client.js";
import {
  appointments,
  bookingServices,
  bookingSettings,
  bookingStaff,
  bookingStaffHours,
  businesses,
} from "../src/db/schema.js";

type HourSpec = Record<number, [string, string] | null>;

type StaffSeed = {
  name: string;
  specialty: string;
  photoUrl: string;
  hours: HourSpec;
};

type ServiceSeed = {
  name: string;
  durationMin: number;
  price: number;
  description: string;
};

const STAFF: StaffSeed[] = [
  {
    name: "Dr. Sari Wijaya",
    specialty: "General Practitioner",
    photoUrl:
      "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=400&h=400&q=80",
    hours: {
      0: null,
      1: ["09:00", "17:00"],
      2: ["09:00", "17:00"],
      3: ["09:00", "17:00"],
      4: ["09:00", "17:00"],
      5: ["09:00", "17:00"],
      6: null,
    },
  },
  {
    name: "Dr. Budi Santoso",
    specialty: "Internal Medicine",
    photoUrl:
      "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=400&h=400&q=80",
    hours: {
      0: null,
      1: ["10:00", "18:00"],
      2: ["10:00", "18:00"],
      3: ["10:00", "18:00"],
      4: ["10:00", "18:00"],
      5: null,
      6: ["09:00", "13:00"],
    },
  },
  {
    name: "Dr. Maya Putri",
    specialty: "Pediatrician",
    photoUrl:
      "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=400&h=400&q=80",
    hours: {
      0: null,
      1: null,
      2: ["08:00", "15:00"],
      3: ["08:00", "15:00"],
      4: ["08:00", "15:00"],
      5: ["08:00", "15:00"],
      6: ["08:00", "15:00"],
    },
  },
  {
    name: "Dr. Andi Pratama",
    specialty: "Dermatologist",
    photoUrl:
      "https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&h=400&q=80",
    hours: {
      0: null,
      1: ["13:00", "20:00"],
      2: null,
      3: ["13:00", "20:00"],
      4: null,
      5: ["13:00", "20:00"],
      6: null,
    },
  },
];

const SERVICES: ServiceSeed[] = [
  {
    name: "General consult",
    durationMin: 30,
    price: 150000,
    description: "First visit with a general practitioner.",
  },
  {
    name: "Follow-up",
    durationMin: 20,
    price: 100000,
    description: "Short follow-up after a previous visit.",
  },
  {
    name: "Pediatric check",
    durationMin: 30,
    price: 175000,
    description: "Child wellness or sick visit.",
  },
  {
    name: "Skin consult",
    durationMin: 45,
    price: 250000,
    description: "Dermatology consult for skin concerns.",
  },
];

function weekHours(spec: HourSpec) {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => {
    const range = spec[dayOfWeek];
    if (!range) {
      return {
        dayOfWeek,
        openTime: "09:00",
        closeTime: "18:00",
        isClosed: true,
      };
    }
    return {
      dayOfWeek,
      openTime: range[0],
      closeTime: range[1],
      isClosed: false,
    };
  });
}

function todayJakartaYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd: string, days: number) {
  const [year, month, day] = ymd.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return utc.toISOString().slice(0, 10);
}

function atJakarta(ymd: string, hm: string) {
  return new Date(`${ymd}T${hm}:00+07:00`);
}

async function seedBooking(slug: string, force: boolean) {
  const business = await db.query.businesses.findFirst({
    where: eq(businesses.slug, slug),
  });
  if (!business) {
    throw new Error(`Business "${slug}" not found.`);
  }

  const existingStaff = await db
    .select()
    .from(bookingStaff)
    .where(eq(bookingStaff.businessId, business.id));

  if (existingStaff.length > 0 && !force) {
    let updatedPhotos = 0;
    for (const person of STAFF) {
      const row = existingStaff.find((item) => item.name === person.name);
      if (row && !row.photoUrl && person.photoUrl) {
        await db
          .update(bookingStaff)
          .set({ photoUrl: person.photoUrl })
          .where(eq(bookingStaff.id, row.id));
        updatedPhotos += 1;
      }
    }
    if (updatedPhotos > 0) {
      console.log(`Filled photos for ${updatedPhotos} existing doctor(s) on ${slug}.`);
    } else {
      console.log(
        `Booking staff already exist for ${slug} (${existingStaff.length}). Re-run with --force to replace.`,
      );
    }
    return;
  }

  if (force) {
    await db.delete(appointments).where(eq(appointments.businessId, business.id));
    await db.delete(bookingServices).where(eq(bookingServices.businessId, business.id));
    await db.delete(bookingStaff).where(eq(bookingStaff.businessId, business.id));
    console.log(`Cleared existing booking data for ${slug}.`);
  }

  await db
    .insert(bookingSettings)
    .values({ businessId: business.id, enabled: true })
    .onConflictDoUpdate({
      target: bookingSettings.businessId,
      set: { enabled: true, updatedAt: new Date() },
    });

  const staffRows: Array<{ id: string; name: string }> = [];
  for (const [index, person] of STAFF.entries()) {
    const id = randomUUID();
    await db.insert(bookingStaff).values({
      id,
      businessId: business.id,
      name: person.name,
      specialty: person.specialty,
      photoUrl: person.photoUrl,
      sortOrder: index,
    });
    await db.insert(bookingStaffHours).values(
      weekHours(person.hours).map((hour) => ({
        id: randomUUID(),
        staffId: id,
        ...hour,
      })),
    );
    staffRows.push({ id, name: person.name });
  }

  const serviceRows: Array<{ id: string; name: string; durationMin: number }> = [];
  for (const [index, service] of SERVICES.entries()) {
    const id = randomUUID();
    await db.insert(bookingServices).values({
      id,
      businessId: business.id,
      name: service.name,
      durationMin: service.durationMin,
      price: service.price,
      description: service.description,
      sortOrder: index,
    });
    serviceRows.push({ id, name: service.name, durationMin: service.durationMin });
  }

  const byName = (name: string) => {
    const row = staffRows.find((item) => item.name === name);
    if (!row) throw new Error(`Missing staff ${name}`);
    return row;
  };
  const service = (name: string) => {
    const row = serviceRows.find((item) => item.name === name);
    if (!row) throw new Error(`Missing service ${name}`);
    return row;
  };

  const today = todayJakartaYmd();
  const bookings: Array<{
    staff: string;
    service: string;
    offset: number;
    time: string;
    customer: string;
    phone: string;
  }> = [
    {
      staff: "Dr. Sari Wijaya",
      service: "General consult",
      offset: 0,
      time: "10:00",
      customer: "Rina Kusuma",
      phone: "0812-1111-2001",
    },
    {
      staff: "Dr. Budi Santoso",
      service: "Follow-up",
      offset: 0,
      time: "14:30",
      customer: "Agus Pratama",
      phone: "0813-2222-2002",
    },
    {
      staff: "Dr. Maya Putri",
      service: "Pediatric check",
      offset: 1,
      time: "09:00",
      customer: "Siti Rahma",
      phone: "0812-3333-2003",
    },
    {
      staff: "Dr. Andi Pratama",
      service: "Skin consult",
      offset: 3,
      time: "15:00",
      customer: "Dewi Lestari",
      phone: "0812-4444-2004",
    },
    {
      staff: "Dr. Sari Wijaya",
      service: "Follow-up",
      offset: 3,
      time: "11:00",
      customer: "Hendra Wijaya",
      phone: "0815-5555-2005",
    },
    {
      staff: "Dr. Budi Santoso",
      service: "General consult",
      offset: 4,
      time: "10:30",
      customer: "Putri Ananda",
      phone: "0812-6666-2006",
    },
    {
      staff: "Dr. Sari Wijaya",
      service: "General consult",
      offset: -3,
      time: "09:30",
      customer: "Fajar Nugroho",
      phone: "0812-7777-2007",
    },
    {
      staff: "Dr. Maya Putri",
      service: "Pediatric check",
      offset: -2,
      time: "08:30",
      customer: "Lestari Ayu",
      phone: "0813-8888-2008",
    },
    {
      staff: "Dr. Andi Pratama",
      service: "Skin consult",
      offset: -2,
      time: "16:00",
      customer: "Rizky Maulana",
      phone: "0812-9999-2009",
    },
  ];

  for (const booking of bookings) {
    const staff = byName(booking.staff);
    const svc = service(booking.service);
    const startsAt = atJakarta(addDaysYmd(today, booking.offset), booking.time);
    const endsAt = new Date(startsAt.getTime() + svc.durationMin * 60 * 1000);
    await db.insert(appointments).values({
      businessId: business.id,
      productId: svc.id,
      treatmentName: svc.name,
      customerName: booking.customer,
      customerPhone: booking.phone,
      startsAt,
      endsAt,
      staffId: staff.id,
      status: "scheduled",
    });
  }

  console.log(
    `Seeded ${staffRows.length} doctors, ${serviceRows.length} services, and ${bookings.length} bookings for ${slug}.`,
  );
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const slug = args.find((arg) => !arg.startsWith("-")) ?? "kontaksenter";

seedBooking(slug, force)
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
