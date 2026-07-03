CREATE TABLE public.user_followers (
  follower_id uuid references public.profiles(id) on delete cascade not null,
  following_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamp with time zone default now() not null,
  primary key (follower_id, following_id)
);

ALTER TABLE public.user_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can see followers" 
ON public.user_followers FOR SELECT USING (true);

CREATE POLICY "Users can follow" 
ON public.user_followers FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow" 
ON public.user_followers FOR DELETE USING (auth.uid() = follower_id);
