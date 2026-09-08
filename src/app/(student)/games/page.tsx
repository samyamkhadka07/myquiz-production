import {requirePage} from '@/lib/server/auth';import {LearningActivities} from '@/components/learning-activities';
export default async function Page(){await requirePage();return <><h1>Learning activities</h1><p>Use verified content for recall, correction, matching and classification. Core quizzes remain available when AI is offline.</p><LearningActivities/></>;}
