-- Keep the English versions of the apartment and drawing stories in range.
update public.feed_post_translations as translation
set body = source.body
from (
  values
    (
      'editorial_story:our-own-key',
      'en',
      $$“We slept on the floor the first night. In our own apartment.”

Ilya and Katya knew the feeling of leaving: suitcases by the door, rented furniture, and a landlord asking them to go. They saved for their own place, but something always came up.

When a deal fell through, Katya said, “Maybe this will never happen.”

That night Ilya opened Abundance. In Goals he wrote the result: keys to a small home where books could stay on a shelf. In Today he chose one step: list three months of expenses and decide what they could save.

The list was uncomfortable. They cancelled unused subscriptions, set a payday transfer, and made a separate fund for the down payment. For months it barely moved. Then Katya took an extra project, and Ilya reserved one evening a week for consulting.

The next apartment had a crack in the kitchen. Before, they would have left. This time they asked questions, calculated repairs, and stayed.

They slept on the floor among boxes, drank tea from two mugs, and passed the key between them.

“We don’t have to give it back,” Katya said.

A home did not begin with a perfect deal. It began when a dream became a route they could keep walking.$$
    ),
    (
      'editorial_story:drawing-again',
      'en',
      $$“At forty-three, I was still hiding my drawings.”

Nastya kept them in a folder with documents. When someone entered the room, she closed it. It felt embarrassing: an adult with a job and family, still making colorful pages nobody saw.

“Do you still draw?” her son asked.
“Sometimes. It doesn’t matter.”

He looked at the folder. “Then why do you smile when you draw?”

After that, Nastya wrote a wish in Goals: build a portfolio. She did not want to become an artist overnight or quit her job. She wanted to stop hiding what gave her energy. In Today, she chose one step: select five drawings and show them to someone she trusted.

The first person was a designer next door. Nastya prepared an excuse for why the work was not serious, but the neighbor interrupted.

“There is a voice here. Let’s see where else it can be heard.”

They chose three pieces for a public album. Nastya photographed them and spent a week afraid to publish. When she did, one comment appeared: “I want to draw again too.”

No commissions arrived. Still, Nastya left the folder on the table. A month later she joined an evening course; two months after that she showed a piece at a small exhibition.

At forty-three, she did not start life over. She stopped deleting an important part of herself from it.$$
    )
) as source(source_key, locale, body)
join public.feed_posts as post on post.source_key = source.source_key
where translation.post_id = post.id
  and translation.locale = source.locale;
