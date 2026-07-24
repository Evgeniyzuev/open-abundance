-- Temporary Reality Feed media source while images.unsplash.com is not
-- consistently reachable for the target audience. Preserve the original
-- licensed Unsplash media and attribution in metadata for a future S3/CDN
-- migration or rollback.

update public.feed_post_media as media
set
  media_url = assets.media_url,
  source_url = assets.media_url,
  source_label = 'Pinterest',
  metadata = coalesce(media.metadata, '{}'::jsonb) || jsonb_build_object(
    'media_provider', 'pinterest',
    'media_migration', 'pinterest_reality_feed_2026-07-24',
    'original_media_url', coalesce(
      media.metadata ->> 'original_media_url',
      media.metadata ->> 'previous_media_url',
      media.media_url
    ),
    'original_source_url', coalesce(
      media.metadata ->> 'original_source_url',
      media.metadata ->> 'previous_source_url',
      media.source_url
    ),
    'original_source_label', coalesce(
      media.metadata ->> 'original_source_label',
      media.metadata ->> 'previous_source_label',
      media.source_label
    )
  )
from (
  values
    ('a1700000-0000-4000-8000-000000000001'::uuid, 'https://i.pinimg.com/736x/58/70/95/5870953bb597aeacc1be8bc5298d0f49.jpg'),
    ('a1700000-0000-4000-8000-000000000002'::uuid, 'https://i.pinimg.com/originals/14/d3/e7/14d3e73988c3f2f9c0a690d394ea16fc.jpg'),
    ('a1700000-0000-4000-8000-000000000003'::uuid, 'https://i.pinimg.com/736x/c7/ca/5b/c7ca5b095c3d8dd440db798f89adc1dd.jpg'),
    ('a1700000-0000-4000-8000-000000000004'::uuid, 'https://i.pinimg.com/736x/25/69/bd/2569bdd07905633e793d168a3373ef61.jpg'),
    ('a1700000-0000-4000-8000-000000000005'::uuid, 'https://i.pinimg.com/736x/07/4c/56/074c56d9ad6a99309c94039e0be875ed.jpg'),
    ('a1700000-0000-4000-8000-000000000006'::uuid, 'https://i.pinimg.com/originals/a1/69/f9/a169f9f5fe1b0dfdb776943e154d3cc4.jpg'),
    ('a1700000-0000-4000-8000-000000000007'::uuid, 'https://i.pinimg.com/736x/0d/31/71/0d31710e22307fd0fcd6219812c59e33.jpg'),
    ('a1700000-0000-4000-8000-000000000008'::uuid, 'https://i.pinimg.com/originals/98/9c/34/989c34202eff6b4f680e270ded6fce3e.jpg'),
    ('a1700000-0000-4000-8000-000000000009'::uuid, 'https://i.pinimg.com/1200x/22/9f/01/229f01146be06f6e5cc6c72f8450af4e.jpg'),
    ('a1700000-0000-4000-8000-000000000010'::uuid, 'https://i.pinimg.com/736x/ee/3d/7b/ee3d7b992da834c58bbd4ce801a88bd2.jpg'),
    ('a1700000-0000-4000-8000-000000000011'::uuid, 'https://i.pinimg.com/736x/01/43/20/0143207546965b7192ec1e8cda81a8ae.jpg'),
    ('a1700000-0000-4000-8000-000000000012'::uuid, 'https://i.pinimg.com/736x/2e/7e/1f/2e7e1fe6ca60c673fb9f610fb517103d.jpg'),
    ('a1700000-0000-4000-8000-000000000013'::uuid, 'https://i.pinimg.com/736x/e8/61/8d/e8618d5238b55de6aa0fd3b358383d29.jpg'),
    ('a1700000-0000-4000-8000-000000000014'::uuid, 'https://i.pinimg.com/736x/e8/ab/65/e8ab65782be6670ccdd1a5199f1e2643.jpg'),
    ('a1700000-0000-4000-8000-000000000015'::uuid, 'https://i.pinimg.com/1200x/10/05/30/10053028c0a9709fcf6831bd25236404.jpg'),
    ('a1700000-0000-4000-8000-000000000016'::uuid, 'https://i.pinimg.com/736x/30/01/c4/3001c4ea1018661aa5cd503ec7e7f54e.jpg'),
    ('a1700000-0000-4000-8000-000000000017'::uuid, 'https://i.pinimg.com/736x/29/10/1a/29101a03f017acfd6659c22d8fc8aaea.jpg'),
    ('a1700000-0000-4000-8000-000000000018'::uuid, 'https://i.pinimg.com/1200x/17/ea/e3/17eae315d73c72603ee92933e44b856d.jpg'),
    ('a1700000-0000-4000-8000-000000000019'::uuid, 'https://i.pinimg.com/1200x/ec/92/7e/ec927e592be3152780053fd3bc3c13b5.jpg'),
    ('a1700000-0000-4000-8000-000000000020'::uuid, 'https://i.pinimg.com/1200x/31/12/d4/3112d4847148fa089529b553884e3f41.jpg'),
    ('a1700000-0000-4000-8000-000000000021'::uuid, 'https://i.pinimg.com/736x/df/26/eb/df26eb53b86f3ad7e139010e32599a00.jpg'),
    ('a1700000-0000-4000-8000-000000000022'::uuid, 'https://i.pinimg.com/736x/18/49/01/18490141a64d79f09f1b7e8c54c2ae2a.jpg'),
    ('a1700000-0000-4000-8000-000000000023'::uuid, 'https://i.pinimg.com/736x/0b/3b/03/0b3b03f620b75390926bb96a850d3a04.jpg'),
    ('a1800000-0000-4000-8000-000000000001'::uuid, 'https://i.pinimg.com/736x/bd/87/3c/bd873cdad88d686d7399ee1875284a37.jpg'),
    ('a1800000-0000-4000-8000-000000000002'::uuid, 'https://i.pinimg.com/736x/a8/41/bc/a841bc09f7668f873b58acc4935b6230.jpg'),
    ('a1800000-0000-4000-8000-000000000003'::uuid, 'https://i.pinimg.com/736x/ba/e7/fe/bae7febd333496f102fc9b293cc16745.jpg'),
    ('a1800000-0000-4000-8000-000000000004'::uuid, 'https://i.pinimg.com/736x/f9/8f/6a/f98f6ac8a53f46e05d2d78eb6a828176.jpg'),
    ('a1800000-0000-4000-8000-000000000005'::uuid, 'https://i.pinimg.com/736x/ac/5a/90/ac5a906bf1443b62d1d7c1fea47949df.jpg'),
    ('a1800000-0000-4000-8000-000000000006'::uuid, 'https://i.pinimg.com/736x/e7/b2/15/e7b215d4879b1eb53ecb72cc5e8da0d6.jpg'),
    ('a1800000-0000-4000-8000-000000000007'::uuid, 'https://i.pinimg.com/736x/86/7e/2c/867e2cf2156873ec3d7a26c0e0791699.jpg'),
    ('a1800000-0000-4000-8000-000000000008'::uuid, 'https://i.pinimg.com/736x/f0/34/f2/f034f29bdb159c788a8ed143ba17b755.jpg'),
    ('a1800000-0000-4000-8000-000000000009'::uuid, 'https://i.pinimg.com/736x/09/1b/be/091bbe1dae948b511d3a0b26bb6ec227.jpg'),
    ('a1800000-0000-4000-8000-000000000010'::uuid, 'https://i.pinimg.com/736x/7d/93/bb/7d93bbc54a31c67a2eb23e44e6add0ee.jpg'),
    ('a1800000-0000-4000-8000-000000000011'::uuid, 'https://i.pinimg.com/736x/82/64/65/8264652af0cde1dd1070b54df1efb4f7.jpg'),
    ('a1800000-0000-4000-8000-000000000012'::uuid, 'https://i.pinimg.com/736x/a4/07/3e/a4073ec37f5c076eb98316fce297e7ca.jpg')
) as assets(post_id, media_url)
where media.post_id = assets.post_id
  and media.media_type = 'image'
  and media.sort_order = 0;
