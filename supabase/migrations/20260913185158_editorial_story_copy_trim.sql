-- Keep the two longer English editorial stories within the requested length.
update public.feed_post_translations as translation
set body = source.body
from (
  values
    (
      'editorial_story:our-own-key',
      'en',
      $$“We slept on the floor the first night. In our own apartment.”

Ilya and Katya were used to moving. Suitcases by the door, someone else’s furniture, and a landlord who could suddenly write: “The apartment needs to be empty.” They saved for a place of their own, but a new expense always appeared.

When another deal fell through, Katya said, “Maybe this will never happen.”

Ilya had no answer. That evening he opened Abundance and wrote the wish as a result instead of a someday plan: keys to a small home where they could leave books on a shelf. In Today, he chose one step — list every expense from the past three months and decide what they could truly save.

The table was uncomfortable. They saw unused subscriptions, impulse deliveries, and the habit of helping everyone at once. They cancelled what they did not need, scheduled a transfer for payday, and created a separate envelope for the down payment. For months, the number barely moved. Then Katya took an extra project, and Ilya reserved one evening a week for consulting.

They returned to view another apartment and found a crack in the kitchen. Before, they would have left. This time they asked questions, recalculated the repairs, and stayed.

On the first night, they slept on the floor among boxes. They drank tea from two different mugs and passed the key between them.

“We don’t have to give it back,” Katya said.

The home did not begin with a perfect deal. It began when a dream became a route they could keep walking.$$
    ),
    (
      'editorial_story:drawing-again',
      'en',
      $$“At forty-three, I was still hiding my drawings.”

Nastya kept her drawings in a folder with documents. Whenever someone entered the room, she closed it first. At forty-three, it felt embarrassing: an adult with a job and family, still making colorful pages nobody was supposed to see.

“Do you still draw?” her son asked one day.
“Sometimes. It doesn’t matter.”

He looked at the folder. “Then why do you smile when you draw?”

After that, Nastya wrote a wish in Goals: build a portfolio. She did not want to become an artist in a month or quit her job. She wanted to stop hiding what gave her energy. In Today, she chose a small step: select five drawings and show them to one person she trusted.

The first person was a designer who lived next door. Nastya prepared an explanation for why the work was not serious, but the neighbor interrupted.

“There is a voice here. Let’s see where else it can be heard.”

They chose three pieces for a public album. Nastya photographed the pages and spent a week afraid to press publish. When she did, there were a few views and one short comment: “I want to draw again too.”

No commissions arrived. But Nastya left the folder on the table for the first time. A month later she joined an evening course, and two months after that she showed a piece at a small exhibition.

At forty-three, she did not start her life over. She stopped deleting an important part of herself from it.$$
    )
) as source(source_key, locale, body)
join public.feed_posts as post on post.source_key = source.source_key
where translation.post_id = post.id
  and translation.locale = source.locale;
