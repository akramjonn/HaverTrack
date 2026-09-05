import React from 'react';
import GuidedMenu from '@/components/meals/GuidedMenu';
import LegacyMenu from '@/components/meals/LegacyMenu';
import { mealFeatures } from '@/lib/mealFeatures';
export default function Menu(){return mealFeatures.guided ? <GuidedMenu/> : <LegacyMenu/>;}
