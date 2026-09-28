alter table products
  add column if not exists live_only boolean not null default false;

comment on column products.live_only is 'True for products created for LORESCALE LIVE only; hidden from the kiosk menu.';
