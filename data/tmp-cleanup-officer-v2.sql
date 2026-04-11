-- Phase 1a v2: Additional officer_reliability cleanup
-- Catches sentence fragments that slipped through v1 cleanup
-- Pattern: names containing common verbs/prepositions that indicate parsed sentence fragments

BEGIN;

-- Count before
-- SELECT COUNT(*) as before_count FROM officer_reliability;

-- Delete entries that contain verbs/prepositions indicating sentence fragments
DELETE FROM officer_reliability
WHERE officer_name ~* '(took |gave |told |went |came |made |said |got |put |let |ran |saw |set |called |placed |found |asked |used |tried |turned |pulled |pushed |brought |left |held |kept |looked |known |named |referred |drove |picked |walked |returned |identified |observed |conducted |discovered |recovered |located |obtained |noted |indicated |contacted |arrived |approached |responded |informed |advised |entered |placed |determined |based |served |appeared |received |assigned |described |directed |instructed |involved |provided |prepared |maintained |continued |confirmed )'
  OR officer_name ~* '''s (report|testimony|investigation|statement|affidavit|deposition|arrest|observation|search|stop|actions|conduct|decision|findings|opinion|account|version|claim|assertion)'
  OR officer_name ~* ' (him|her|them|his|her|its|the |a |an |into |from |with |about |after |before |during |between |under |over |upon |through |against |toward |within |without |around ) '
  OR officer_name ~* '(who |that |which |where |when |what |how |why |did |does |could |would |should |might |must |shall |will |can |may |has |had |have |was |were |are |is |been |being )'
  OR length(officer_name) > 35;

COMMIT;
